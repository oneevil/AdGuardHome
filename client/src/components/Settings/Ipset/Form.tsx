import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import Card from '../../ui/Card';
import RulesTable from './RulesTable';
import RuleModal from './RuleModal';
import AutoCreateTable from './AutoCreateTable';
import AutoCreateModal, { IpsetDefinition } from './AutoCreateModal';
import { parseIPSetRule, isDuplicateRule, validateIPSetRule } from '../../../helpers/ipset';
import { Radio } from '../../ui/Controls/Radio';
import { Input } from '../../ui/Controls/Input';
import { Checkbox } from '../../ui/Controls/Checkbox';

interface IpsetCreateConfig {
    enabled: boolean;
    sets: IpsetDefinition[];
}

interface MikroTikConfig {
    url: string;
    username: string;
    password: string;
    insecure: boolean;
    timeout: number;
    ipv6: boolean;
    use_dns_ttl: boolean;
}

interface FormProps {
    initialRules: string[];
    initialFilePath: string;
    initialIpsetCreate: IpsetCreateConfig | null;
    initialMikrotik: MikroTikConfig | null;
    onSubmit: (data: any) => void;
    processing: boolean;
}

type StorageMode = 'config' | 'file';

const Form: React.FC<FormProps> = ({ initialRules, initialFilePath, initialIpsetCreate, initialMikrotik, onSubmit, processing }) => {
    const { t } = useTranslation();

    // Determine initial mode
    const initialMode: StorageMode = initialFilePath && initialFilePath.trim() !== '' ? 'file' : 'config';

    const [mode, setMode] = useState<StorageMode>(initialMode);
    const [rules, setRules] = useState<string[]>(initialRules);
    const [filePath, setFilePath] = useState<string>(initialFilePath);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    // AutoCreate state
    const [autoCreateEnabled, setAutoCreateEnabled] = useState(initialIpsetCreate?.enabled || false);
    const [autoCreateSets, setAutoCreateSets] = useState<IpsetDefinition[]>(initialIpsetCreate?.sets || []);
    const [isAutoCreateModalOpen, setIsAutoCreateModalOpen] = useState(false);
    const [editingAutoCreateIndex, setEditingAutoCreateIndex] = useState<number | null>(null);

    // MikroTik state
    const [mikrotikUrl, setMikrotikUrl] = useState(initialMikrotik?.url || '');
    const [mikrotikUsername, setMikrotikUsername] = useState(initialMikrotik?.username || '');
    const [mikrotikPassword, setMikrotikPassword] = useState(initialMikrotik?.password || '');
    const [mikrotikInsecure, setMikrotikInsecure] = useState(initialMikrotik?.insecure || false);
    const [mikrotikTimeout, setMikrotikTimeout] = useState(initialMikrotik?.timeout || 0);
    const [mikrotikIpv6, setMikrotikIpv6] = useState(initialMikrotik?.ipv6 || false);
    const [mikrotikUseDnsTtl, setMikrotikUseDnsTtl] = useState(initialMikrotik?.use_dns_ttl || false);

    // Update when initial values change
    useEffect(() => {
        setRules(initialRules);
        setFilePath(initialFilePath);
        setAutoCreateEnabled(initialIpsetCreate?.enabled || false);
        setAutoCreateSets(initialIpsetCreate?.sets || []);
        setMikrotikUrl(initialMikrotik?.url || '');
        setMikrotikUsername(initialMikrotik?.username || '');
        setMikrotikPassword(initialMikrotik?.password || '');
        setMikrotikInsecure(initialMikrotik?.insecure || false);
        setMikrotikTimeout(initialMikrotik?.timeout || 0);
        setMikrotikIpv6(initialMikrotik?.ipv6 || false);
        setMikrotikUseDnsTtl(initialMikrotik?.use_dns_ttl || false);
        const newMode = initialFilePath && initialFilePath.trim() !== '' ? 'file' : 'config';
        setMode(newMode);
        setIsDirty(false);
    }, [initialRules, initialFilePath, initialIpsetCreate, initialMikrotik]);

    const handleModeChange = (newMode: StorageMode) => {
        setMode(newMode);
        setIsDirty(true);
    };

    const handleAddRule = () => {
        setEditingIndex(null);
        setIsModalOpen(true);
    };

    const handleEditRule = (index: number, _rule: string) => {
        setEditingIndex(index);
        setIsModalOpen(true);
    };

    const handleSaveRule = (newRule: string) => {
        // Validate rule
        const error = validateIPSetRule(newRule);
        if (error) {
            alert(`Invalid rule: ${error}`);
            return;
        }

        // Check for duplicates (exclude current rule if editing)
        const otherRules = editingIndex !== null
            ? rules.filter((_, i) => i !== editingIndex)
            : rules;

        if (isDuplicateRule(newRule, otherRules)) {
            alert(t('ipset_duplicate_rule'));
            return;
        }

        if (editingIndex !== null) {
            // Edit existing rule
            const newRules = [...rules];
            newRules[editingIndex] = newRule;
            setRules(newRules);
        } else {
            // Add new rule
            setRules([...rules, newRule]);
        }

        setIsDirty(true);
    };

    const handleDeleteRule = (index: number) => {
        if (window.confirm(t('ipset_confirm_delete'))) {
            const newRules = rules.filter((_, i) => i !== index);
            setRules(newRules);
            setIsDirty(true);
        }
    };

    const handleFilePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilePath(e.target.value);
        setIsDirty(true);
    };

    const handleAutoCreateEnabledChange = () => {
        setAutoCreateEnabled(!autoCreateEnabled);
        setIsDirty(true);
    };

    const handleAddAutoCreateSet = () => {
        setEditingAutoCreateIndex(null);
        setIsAutoCreateModalOpen(true);
    };

    const handleEditAutoCreateSet = (index: number, _definition: IpsetDefinition) => {
        setEditingAutoCreateIndex(index);
        setIsAutoCreateModalOpen(true);
    };

    const handleSaveAutoCreateSet = (definitions: IpsetDefinition[]) => {
        if (editingAutoCreateIndex !== null) {
            // When editing, replace the single item
            const newSets = [...autoCreateSets];
            newSets[editingAutoCreateIndex] = definitions[0];
            setAutoCreateSets(newSets);
        } else {
            // When adding, append all new definitions
            setAutoCreateSets([...autoCreateSets, ...definitions]);
        }
        setIsDirty(true);
    };

    const handleDeleteAutoCreateSet = (index: number) => {
        if (window.confirm(t('ipset_autocreate_confirm_delete'))) {
            const newSets = autoCreateSets.filter((_, i) => i !== index);
            setAutoCreateSets(newSets);
            setIsDirty(true);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const ipsetCreate: IpsetCreateConfig = {
            enabled: autoCreateEnabled,
            sets: autoCreateSets,
        };

        const mikrotik: MikroTikConfig = {
            url: mikrotikUrl.trim(),
            username: mikrotikUsername,
            password: mikrotikPassword,
            insecure: mikrotikInsecure,
            timeout: mikrotikUseDnsTtl ? 0 : mikrotikTimeout,
            ipv6: mikrotikIpv6,
            use_dns_ttl: mikrotikUseDnsTtl,
        };

        if (mode === 'file') {
            if (!filePath || filePath.trim() === '') {
                alert(t('ipset_file_path_required'));
                return;
            }
            onSubmit({ ipset: [], ipset_file: filePath.trim(), ipset_create: ipsetCreate, mikrotik });
        } else {
            // Validate all rules
            const invalidRule = rules.find((rule) => validateIPSetRule(rule) !== undefined);
            if (invalidRule) {
                const error = validateIPSetRule(invalidRule);
                alert(`Invalid rule "${invalidRule}": ${error}`);
                return;
            }
            onSubmit({ ipset: rules, ipset_file: '', ipset_create: ipsetCreate, mikrotik });
        }

        setIsDirty(false);
    };

    const modeOptions = [
        { value: 'config', label: t('ipset_mode_config') },
        { value: 'file', label: t('ipset_mode_file') },
    ];

    const editingRule = editingIndex !== null ? rules[editingIndex] : null;
    const parsedEditingRule = editingRule ? parseIPSetRule(editingRule) : null;

    return (
        <form onSubmit={handleSubmit}>
            <Card title={t('ipset_rules')} bodyType="card-body box-body--settings">
                <div className="form">
                    <div className="row">
                        <div className="col-12">
                            <div className="form__group form__group--settings">
                                <label className="form__label form__label--with-desc">
                                    {t('ipset_storage_mode')}
                                </label>
                                <div className="form__desc form__desc--top">{t('ipset_storage_mode_desc')}</div>
                                <div className="custom-controls-stacked">
                                    <Radio
                                        name="storage_mode"
                                        value={mode}
                                        options={modeOptions}
                                        disabled={processing}
                                        onChange={(value) => handleModeChange(value as StorageMode)}
                                    />
                                </div>
                            </div>
                        </div>

                        {mode === 'file' ? (
                            <div className="col-12 col-md-7">
                                <div className="form__group form__group--settings">
                                    <Input
                                        name="ipset_file"
                                        value={filePath}
                                        onChange={handleFilePathChange}
                                        label={t('ipset_file_path')}
                                        desc={t('ipset_file_path_desc')}
                                        placeholder="/etc/adguardhome/ipset.conf"
                                        disabled={processing}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="col-12">
                                <div className="form__group form__group--settings">
                                    <div className="form__desc mb-3">{t('ipset_rules_desc')}</div>

                                    <button
                                        type="button"
                                        className="btn btn-success btn-sm mb-3"
                                        onClick={handleAddRule}
                                        disabled={processing}>
                                        + {t('ipset_add_rule')}
                                    </button>

                                    <RulesTable
                                        rules={rules}
                                        onEdit={handleEditRule}
                                        onDelete={handleDeleteRule}
                                        disabled={processing}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <Card title={t('ipset_autocreate_title')} bodyType="card-body box-body--settings">
                <div className="form">
                    <div className="row">
                        <div className="col-12">
                            <div className="form__group form__group--settings">
                                <div className="form__desc form__desc--top mb-3">
                                    {t('ipset_autocreate_desc')}
                                </div>
                                <Checkbox
                                    name="autocreate_enabled"
                                    value={autoCreateEnabled}
                                    title={t('ipset_autocreate_enable')}
                                    disabled={processing}
                                    onChange={handleAutoCreateEnabledChange}
                                />
                            </div>
                        </div>

                        {autoCreateEnabled && (
                            <div className="col-12">
                                <div className="form__group form__group--settings mt-2">
                                    <label className="form__label">{t('ipset_autocreate_sets')}</label>
                                    <div className="form__desc mb-3">{t('ipset_autocreate_sets_desc')}</div>

                                    <button
                                        type="button"
                                        className="btn btn-success btn-sm mb-3"
                                        onClick={handleAddAutoCreateSet}
                                        disabled={processing}>
                                        + {t('ipset_autocreate_add')}
                                    </button>

                                    <AutoCreateTable
                                        definitions={autoCreateSets}
                                        onEdit={handleEditAutoCreateSet}
                                        onDelete={handleDeleteAutoCreateSet}
                                        disabled={processing}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <Card title={t('mikrotik_title')} bodyType="card-body box-body--settings">
                <div className="form">
                    <div className="row">
                        <div className="col-12">
                            <div className="form__group form__group--settings">
                                <div className="form__desc form__desc--top mb-3">
                                    {t('mikrotik_desc')}
                                </div>
                            </div>
                        </div>

                        <div className="col-12 col-md-6">
                            <div className="form__group form__group--settings">
                                <Input
                                    name="mikrotik_url"
                                    value={mikrotikUrl}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setMikrotikUrl(e.target.value); setIsDirty(true); }}
                                    label={t('mikrotik_url')}
                                    desc={t('mikrotik_url_desc')}
                                    placeholder="https://192.168.88.1"
                                    disabled={processing}
                                />
                            </div>
                        </div>

                        <div className="col-12">
                            <div className="form__group form__group--settings">
                                <Checkbox
                                    name="mikrotik_insecure"
                                    value={mikrotikInsecure}
                                    title={t('mikrotik_insecure')}
                                    disabled={processing}
                                    onChange={() => { setMikrotikInsecure(!mikrotikInsecure); setIsDirty(true); }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="row">
                        <div className="col-12 col-md-3">
                            <div className="form__group form__group--settings">
                                <Input
                                    name="mikrotik_username"
                                    value={mikrotikUsername}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setMikrotikUsername(e.target.value); setIsDirty(true); }}
                                    label={t('mikrotik_username')}
                                    placeholder="admin"
                                    disabled={processing}
                                />
                            </div>
                        </div>

                        <div className="col-12 col-md-3">
                            <div className="form__group form__group--settings">
                                <Input
                                    name="mikrotik_password"
                                    value={mikrotikPassword}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setMikrotikPassword(e.target.value); setIsDirty(true); }}
                                    label={t('mikrotik_password')}
                                    disabled={processing}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="row">
                        <div className="col-12 col-md-3">
                            <div className="form__group form__group--settings">
                                <Input
                                    name="mikrotik_timeout"
                                    value={String(mikrotikTimeout)}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setMikrotikTimeout(parseInt(e.target.value, 10) || 0); setIsDirty(true); }}
                                    label={t('mikrotik_timeout')}
                                    desc={t('mikrotik_timeout_desc')}
                                    placeholder="0"
                                    disabled={processing || mikrotikUseDnsTtl}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="row">
                        <div className="col-12">
                            <div className="form__group form__group--settings">
                                <Checkbox
                                    name="mikrotik_use_dns_ttl"
                                    value={mikrotikUseDnsTtl}
                                    title={t('mikrotik_use_dns_ttl')}
                                    subtitle={t('mikrotik_use_dns_ttl_desc')}
                                    disabled={processing}
                                    onChange={() => { setMikrotikUseDnsTtl(!mikrotikUseDnsTtl); setIsDirty(true); }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="row">
                        <div className="col-12">
                            <div className="form__group form__group--settings">
                                <Checkbox
                                    name="mikrotik_ipv6"
                                    value={mikrotikIpv6}
                                    title={t('mikrotik_ipv6')}
                                    subtitle={t('mikrotik_ipv6_desc')}
                                    disabled={processing}
                                    onChange={() => { setMikrotikIpv6(!mikrotikIpv6); setIsDirty(true); }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="card-actions">
                <div className="btn-list">
                    <button
                        type="submit"
                        className="btn btn-success btn-standard btn-large"
                        disabled={!isDirty || processing}>
                        {t('save_btn')}
                    </button>
                </div>
            </div>

            <AutoCreateModal
                isOpen={isAutoCreateModalOpen}
                onClose={() => setIsAutoCreateModalOpen(false)}
                onSave={handleSaveAutoCreateSet}
                initialDefinition={editingAutoCreateIndex !== null ? autoCreateSets[editingAutoCreateIndex] : null}
                title={editingAutoCreateIndex !== null ? t('ipset_autocreate_edit') : t('ipset_autocreate_add')}
            />

            <RuleModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveRule}
                initialDomains={parsedEditingRule?.domains.join(',') || ''}
                initialIPSets={parsedEditingRule?.ipsets.join(',') || ''}
                title={editingIndex !== null ? t('ipset_edit_rule') : t('ipset_add_rule')}
            />
        </form>
    );
};

export default Form;
