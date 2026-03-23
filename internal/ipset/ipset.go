// Package ipset provides ipset functionality.
package ipset

import (
	"context"
	"log/slog"
	"net"
)

// Manager is the ipset manager interface.
//
// TODO(a.garipov): Perhaps generalize this into some kind of a NetFilter type,
// since ipset is exclusive to Linux?
type Manager interface {
	Add(ctx context.Context, host string, ip4s, ip6s []net.IP, ttl uint32) (n int, err error)
	Close() (err error)
}

// Config is the configuration structure for the ipset manager.
type Config struct {
	// Logger is used for logging the operation of the ipset manager.  It must
	// not be nil.
	Logger *slog.Logger

	// Lines is the ipset configuration with the following syntax:
	//
	//	DOMAIN[,DOMAIN].../IPSET_NAME[,IPSET_NAME]...
	//
	// Lines must not contain any blank lines or comments.
	Lines []string

	// MikroTik, if not nil and URL is set, enables the MikroTik REST API
	// backend instead of the Linux ipset backend.
	MikroTik *MikroTikConfig
}

// NewManager returns a new ipset manager.  If MikroTik configuration is
// provided, the MikroTik REST API backend is used.  Otherwise, the OS-specific
// ipset backend is used (Linux only).
//
// If conf.Lines is empty, mgr and err are nil.  The error's chain contains
// [errors.ErrUnsupported] if current OS is not supported.
func NewManager(ctx context.Context, conf *Config) (mgr Manager, err error) {
	if len(conf.Lines) == 0 {
		return nil, nil
	}

	// Use MikroTik backend if configured.
	if conf.MikroTik != nil && conf.MikroTik.URL != "" {
		return newMikrotikManager(ctx, conf)
	}

	return newManager(ctx, conf)
}
