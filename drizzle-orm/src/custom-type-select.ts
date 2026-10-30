export interface CustomTypeSelectTransformConfig<TData, TDriver> {
  dataType: () => string;
  toDriver?: (value: TData) => TDriver;
  fromDriver?: (value: TDriver) => TData;
  selectSQL?: (columnSql: string) => string;
}

export function withDefaultCustomSelect<TData, TDriver>(
  config: CustomTypeSelectTransformConfig<TData, TDriver>,
  columnIdentifier: string
): string {
  if (typeof config.selectSQL === 'function') {
    return config.selectSQL(columnIdentifier);
  }
  return columnIdentifier;
}
