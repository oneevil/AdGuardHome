import React from 'react';
import { useTranslation } from 'react-i18next';

// @ts-expect-error FIXME: update react-table
import ReactTable from 'react-table';

import { TABLES_MIN_ROWS } from '../../../helpers/constants';
import { LocalStorageHelper, LOCAL_STORAGE_KEYS } from '../../../helpers/localStorageHelper';
import { parseIPSetRule } from '../../../helpers/ipset';

interface cellWrapProps {
    value: string;
}

const cellWrap = ({ value }: cellWrapProps) => (
    <div className="logs__row o-hidden">
        <span className="logs__text" title={value}>
            {value}
        </span>
    </div>
);

interface RulesTableProps {
    rules: string[];
    onEdit: (index: number, rule: string) => void;
    onDelete: (index: number) => void;
    disabled?: boolean;
}

const RulesTable: React.FC<RulesTableProps> = ({ rules, onEdit, onDelete, disabled = false }) => {
    const { t } = useTranslation();

    const data = rules.map((rule, index) => {
        const parsed = parseIPSetRule(rule);
        return {
            index,
            rule,
            domains: parsed ? parsed.domains.join(', ') : rule,
            ipsets: parsed ? parsed.ipsets.join(', ') : '',
            isInvalid: !parsed,
        };
    });

    return (
        <ReactTable
            data={data}
            columns={[
                {
                    Header: t('ipset_domains'),
                    accessor: 'domains',
                    minWidth: 300,
                    Cell: ({ value, original }: any) => (
                        <div className="logs__row o-hidden">
                            <span
                                className={`logs__text${original.isInvalid ? ' text-danger' : ''}`}
                                title={value}>
                                {original.isInvalid ? `${t('ipset_invalid_rule')}: ${value}` : value}
                            </span>
                        </div>
                    ),
                },
                {
                    Header: t('ipset_names'),
                    accessor: 'ipsets',
                    minWidth: 200,
                    Cell: cellWrap,
                },
                {
                    Header: t('actions_table_header'),
                    accessor: 'actions',
                    maxWidth: 150,
                    sortable: false,
                    resizable: false,
                    Cell: (row: any) => {
                        const { index: idx, rule: r } = row.original;

                        return (
                            <div className="logs__row logs__row--center">
                                <button
                                    type="button"
                                    className="btn btn-icon btn-outline-primary btn-sm mr-2"
                                    onClick={() => onEdit(idx, r)}
                                    disabled={disabled}
                                    title={t('edit_table_action')}>
                                    <svg className="icons icon12">
                                        <use xlinkHref="#edit" />
                                    </svg>
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-icon btn-outline-secondary btn-sm"
                                    onClick={() => onDelete(idx)}
                                    disabled={disabled}
                                    title={t('delete_table_action')}>
                                    <svg className="icons icon12">
                                        <use xlinkHref="#delete" />
                                    </svg>
                                </button>
                            </div>
                        );
                    },
                },
            ]}
            showPagination
            defaultPageSize={LocalStorageHelper.getItem(LOCAL_STORAGE_KEYS.REWRITES_PAGE_SIZE) || 10}
            onPageSizeChange={(size: any) =>
                LocalStorageHelper.setItem(LOCAL_STORAGE_KEYS.REWRITES_PAGE_SIZE, size)
            }
            minRows={TABLES_MIN_ROWS}
            ofText="/"
            previousText={t('previous_btn')}
            nextText={t('next_btn')}
            pageText={t('page_table_footer_text')}
            rowsText={t('rows_table_footer_text')}
            loadingText={t('loading_table_status')}
            noDataText={t('ipset_no_rules')}
            className="-striped -highlight card-table-overflow"
        />
    );
};

export default RulesTable;
