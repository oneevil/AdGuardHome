import React from 'react';
import { useTranslation } from 'react-i18next';

// @ts-expect-error FIXME: update react-table
import ReactTable from 'react-table';

import { TABLES_MIN_ROWS } from '../../../helpers/constants';
import { LocalStorageHelper, LOCAL_STORAGE_KEYS } from '../../../helpers/localStorageHelper';
import type { IpsetDefinition } from './AutoCreateModal';

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

interface AutoCreateTableProps {
    definitions: IpsetDefinition[];
    onEdit: (index: number, definition: IpsetDefinition) => void;
    onDelete: (index: number) => void;
    disabled?: boolean;
}

const AutoCreateTable: React.FC<AutoCreateTableProps> = ({
    definitions,
    onEdit,
    onDelete,
    disabled = false,
}) => {
    const { t } = useTranslation();

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'hash:ip':
                return t('ipset_autocreate_type_ip');
            case 'hash:net':
                return t('ipset_autocreate_type_net');
            default:
                return type;
        }
    };

    const getFamilyLabel = (family: string) => {
        switch (family) {
            case 'inet':
                return t('ipset_autocreate_family_ipv4');
            case 'inet6':
                return t('ipset_autocreate_family_ipv6');
            default:
                return family;
        }
    };

    const data = definitions.map((def, index) => ({
        index,
        ...def,
        typeLabel: getTypeLabel(def.type),
        familyLabel: getFamilyLabel(def.family),
        timeoutLabel: def.timeout === 0 ? t('disabled') : `${def.timeout}s`,
    }));

    return (
        <ReactTable
            data={data}
            columns={[
                {
                    Header: t('ipset_autocreate_name'),
                    accessor: 'name',
                    minWidth: 200,
                    Cell: cellWrap,
                },
                {
                    Header: t('ipset_autocreate_type'),
                    accessor: 'typeLabel',
                    minWidth: 150,
                    Cell: cellWrap,
                },
                {
                    Header: t('ipset_autocreate_family'),
                    accessor: 'familyLabel',
                    minWidth: 120,
                    Cell: cellWrap,
                },
                {
                    Header: t('ipset_autocreate_timeout'),
                    accessor: 'timeoutLabel',
                    minWidth: 100,
                    Cell: cellWrap,
                },
                {
                    Header: t('actions_table_header'),
                    accessor: 'actions',
                    maxWidth: 150,
                    sortable: false,
                    resizable: false,
                    Cell: (row: any) => {
                        const { index: idx } = row.original;
                        const def = definitions[idx];

                        return (
                            <div className="logs__row logs__row--center">
                                <button
                                    type="button"
                                    className="btn btn-icon btn-outline-primary btn-sm mr-2"
                                    onClick={() => onEdit(idx, def)}
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
            noDataText={t('ipset_autocreate_no_sets')}
            className="-striped -highlight card-table-overflow"
        />
    );
};

export default AutoCreateTable;
