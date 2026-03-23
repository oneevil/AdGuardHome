package ipset

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"

	"github.com/AdguardTeam/golibs/container"
	"github.com/AdguardTeam/golibs/logutil/slogutil"
)

// MikroTikConfig contains the configuration for connecting to a MikroTik
// router via its REST API.
type MikroTikConfig struct {
	// URL is the base URL of the MikroTik router REST API, e.g.
	// "https://192.168.88.1" or "http://192.168.88.1".
	URL string `yaml:"url"`

	// Username is the username for authentication.
	Username string `yaml:"username"`

	// Password is the password for authentication.
	Password string `yaml:"password"`

	// Insecure, if true, skips TLS certificate verification.
	Insecure bool `yaml:"insecure"`

	// Timeout is the timeout in seconds for address-list entries.
	// 0 means no timeout (entries are permanent).
	Timeout uint32 `yaml:"timeout"`

	// IPv6, if true, also adds IPv6 addresses to the MikroTik IPv6
	// firewall address-list via /ipv6/firewall/address-list/add.
	IPv6 bool `yaml:"ipv6"`

	// UseDNSTTL, if true, uses the DNS response TTL as the timeout for
	// address-list entries instead of the fixed Timeout value.
	UseDNSTTL bool `yaml:"use_dns_ttl"`
}

// mikrotikManager is the MikroTik REST API ipset manager.  It adds resolved IP
// addresses to MikroTik firewall address-lists using the REST API.
type mikrotikManager struct {
	logger *slog.Logger

	client    *http.Client
	url       string
	user      string
	pass      string
	timeout   uint32
	ipv6      bool
	useDNSTTL bool

	domainToLists map[string][]string

	// mu protects addedIPs.
	mu       *sync.Mutex
	addedIPs *container.MapSet[mikrotikEntry]
}

// mikrotikEntry is the type for entries in the added IPs cache.
type mikrotikEntry struct {
	listName string
	ipArr    [net.IPv6len]byte
}

// newMikrotikManager creates a new MikroTik manager from the given
// configuration.
func newMikrotikManager(
	ctx context.Context,
	conf *Config,
) (mgr Manager, err error) {
	mc := conf.MikroTik
	if mc == nil || mc.URL == "" {
		return nil, nil
	}

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: mc.Insecure,
		},
	}

	m := &mikrotikManager{
		logger:    conf.Logger,
		client:    &http.Client{Transport: transport},
		url:       strings.TrimRight(mc.URL, "/"),
		user:      mc.Username,
		pass:      mc.Password,
		timeout:   mc.Timeout,
		ipv6:      mc.IPv6,
		useDNSTTL: mc.UseDNSTTL,

		domainToLists: make(map[string][]string),

		mu:       &sync.Mutex{},
		addedIPs: container.NewMapSet[mikrotikEntry](),
	}

	err = m.parseConfig(conf.Lines)
	if err != nil {
		return nil, fmt.Errorf("mikrotik: parsing config: %w", err)
	}

	conf.Logger.InfoContext(ctx, "mikrotik manager initialized",
		"url", mc.URL,
		"rules", len(conf.Lines),
	)

	return m, nil
}

// parseConfig parses ipset configuration lines into domain-to-list mappings.
func (m *mikrotikManager) parseConfig(lines []string) (err error) {
	for i, line := range lines {
		hosts, listNames, lineErr := parseMikrotikConfigLine(line)
		if lineErr != nil {
			return fmt.Errorf("line %d: %w", i, lineErr)
		}

		for _, host := range hosts {
			m.domainToLists[host] = append(m.domainToLists[host], listNames...)
		}
	}

	return nil
}

// parseMikrotikConfigLine parses one ipset configuration line into hosts and list
// names.  The format is: DOMAIN[,DOMAIN].../LIST_NAME[,LIST_NAME]...
func parseMikrotikConfigLine(confStr string) (hosts, listNames []string, err error) {
	confStr = strings.TrimSpace(confStr)
	parts := strings.Split(confStr, "/")
	if len(parts) != 2 {
		return nil, nil, fmt.Errorf("invalid value %q: expected one slash", confStr)
	}

	hosts = strings.Split(parts[0], ",")
	listNames = strings.Split(parts[1], ",")

	if len(listNames) == 0 {
		return nil, nil, nil
	}

	for i := range listNames {
		listNames[i] = strings.TrimSpace(listNames[i])
		if len(listNames[i]) == 0 {
			return nil, nil, fmt.Errorf("invalid value %q: empty list name", confStr)
		}
	}

	for i := range hosts {
		hosts[i] = strings.ToLower(strings.TrimSpace(hosts[i]))
	}

	return hosts, listNames, nil
}

// lookupHost finds the address-lists for the host, taking subdomain wildcards
// into account.
func (m *mikrotikManager) lookupHost(host string) (lists []string) {
	for i := 0; ; i++ {
		host = host[i:]
		lists = m.domainToLists[host]
		if lists != nil {
			return lists
		}

		i = strings.Index(host, ".")
		if i == -1 {
			break
		}
	}

	// Check the root catch-all.
	return m.domainToLists[""]
}

// mikrotikAddressListEntry is the JSON body for adding an address-list entry
// via the MikroTik REST API.
type mikrotikAddressListEntry struct {
	List    string `json:"list"`
	Address string `json:"address"`
	Comment string `json:"comment,omitempty"`
	Timeout string `json:"timeout,omitempty"`
}

// addToMikrotik sends a POST request to the MikroTik REST API to add an IP
// address to an address-list.  When isIPv6 is true, the IPv6 firewall
// address-list endpoint is used.
func (m *mikrotikManager) addToMikrotik(
	ctx context.Context,
	listName string,
	ip net.IP,
	host string,
	isIPv6 bool,
	timeout uint32,
) (err error) {
	entry := mikrotikAddressListEntry{
		List:    listName,
		Address: ip.String(),
		Comment: fmt.Sprintf("AdGuardHome: %s", host),
	}

	if timeout > 0 {
		entry.Timeout = fmt.Sprintf("%d", timeout)
	}

	body, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("marshaling entry: %w", err)
	}

	apiPath := "/rest/ip/firewall/address-list/add"
	if isIPv6 {
		apiPath = "/rest/ipv6/firewall/address-list/add"
	}

	url := m.url + apiPath
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}

	req.SetBasicAuth(m.user, m.pass)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("sending request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= http.StatusBadRequest {
		var errResp struct {
			Error   int    `json:"error"`
			Message string `json:"message"`
			Detail  string `json:"detail"`
		}
		if decErr := json.NewDecoder(resp.Body).Decode(&errResp); decErr == nil {
			// "already have such entry" means the IP is already in the
			// address-list.  If timeout is set, refresh it so the entry
			// stays alive as long as the domain is being queried.
			if strings.Contains(errResp.Detail, "already have such entry") {
				if timeout > 0 {
					return m.refreshEntry(ctx, listName, ip, isIPv6, timeout)
				}

				return nil
			}

			return fmt.Errorf("mikrotik api error %d: %s: %s",
				errResp.Error, errResp.Message, errResp.Detail)
		}

		return fmt.Errorf("mikrotik api returned status %d", resp.StatusCode)
	}

	return nil
}

// refreshEntry finds an existing address-list entry and resets its timeout.
func (m *mikrotikManager) refreshEntry(
	ctx context.Context,
	listName string,
	ip net.IP,
	isIPv6 bool,
	timeout uint32,
) (err error) {
	// Find the entry by address and list name.
	apiPath := "/rest/ip/firewall/address-list"
	if isIPv6 {
		apiPath = "/rest/ipv6/firewall/address-list"
	}

	findURL := fmt.Sprintf("%s%s?address=%s&list=%s", m.url, apiPath, ip.String(), listName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, findURL, nil)
	if err != nil {
		return fmt.Errorf("creating find request: %w", err)
	}

	req.SetBasicAuth(m.user, m.pass)

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("finding entry: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	var entries []struct {
		ID string `json:".id"`
	}
	if decErr := json.NewDecoder(resp.Body).Decode(&entries); decErr != nil || len(entries) == 0 {
		return nil
	}

	// Update the timeout on the found entry.
	setBody, _ := json.Marshal(map[string]string{
		".id":     entries[0].ID,
		"timeout": fmt.Sprintf("%d", timeout),
	})

	setURL := fmt.Sprintf("%s%s/set", m.url, apiPath)
	setReq, err := http.NewRequestWithContext(ctx, http.MethodPost, setURL, bytes.NewReader(setBody))
	if err != nil {
		return fmt.Errorf("creating set request: %w", err)
	}

	setReq.SetBasicAuth(m.user, m.pass)
	setReq.Header.Set("Content-Type", "application/json")

	setResp, err := m.client.Do(setReq)
	if err != nil {
		return fmt.Errorf("updating entry timeout: %w", err)
	}
	defer func() { _ = setResp.Body.Close() }()

	return nil
}

// Add implements the [Manager] interface for *mikrotikManager.
func (m *mikrotikManager) Add(
	ctx context.Context,
	host string,
	ip4s, ip6s []net.IP,
	ttl uint32,
) (n int, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	lists := m.lookupHost(host)
	if len(lists) == 0 {
		return 0, nil
	}

	for _, listName := range lists {
		// Process IPv4 addresses.
		for _, ip := range ip4s {
			e := mikrotikEntry{listName: listName}
			copy(e.ipArr[:], ip.To16())

			// Determine the effective timeout for this entry.
			effTimeout := m.timeout
			if m.useDNSTTL && ttl > 0 {
				effTimeout = ttl
			}

			// When timeout is set, skip the cache check so entries are
			// re-added after they expire in MikroTik.  The "already have
			// such entry" error is handled as a no-op.
			if effTimeout == 0 && m.addedIPs.Has(e) {
				continue
			}

			addErr := m.addToMikrotik(ctx, listName, ip, host, false, effTimeout)
			if addErr != nil {
				m.logger.ErrorContext(ctx, "adding ip to mikrotik address-list",
					slogutil.KeyError, addErr,
					"list", listName,
					"ip", ip,
					"host", host,
				)

				continue
			}

			if effTimeout == 0 {
				m.addedIPs.Add(e)
			}
			n++

			m.logger.DebugContext(ctx, "added ip to mikrotik address-list",
				"list", listName,
				"ip", ip,
				"host", host,
			)
		}

		// Process IPv6 addresses if enabled.
		if m.ipv6 {
			for _, ip := range ip6s {
				e := mikrotikEntry{listName: listName}
				copy(e.ipArr[:], ip.To16())

				// Determine the effective timeout for this entry.
				effTimeout := m.timeout
				if m.useDNSTTL && ttl > 0 {
					effTimeout = ttl
				}

				if effTimeout == 0 && m.addedIPs.Has(e) {
					continue
				}

				addErr := m.addToMikrotik(ctx, listName, ip, host, true, effTimeout)
				if addErr != nil {
					m.logger.ErrorContext(ctx, "adding ipv6 to mikrotik address-list",
						slogutil.KeyError, addErr,
						"list", listName,
						"ip", ip,
						"host", host,
					)

					continue
				}

				if effTimeout == 0 {
					m.addedIPs.Add(e)
				}
				n++

				m.logger.DebugContext(ctx, "added ipv6 to mikrotik address-list",
					"list", listName,
					"ip", ip,
					"host", host,
				)
			}
		}
	}

	return n, nil
}

// Close implements the [Manager] interface for *mikrotikManager.
func (m *mikrotikManager) Close() (err error) {
	m.client.CloseIdleConnections()

	return nil
}
