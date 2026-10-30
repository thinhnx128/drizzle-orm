// File: drizzle-orm/src/custom-type-select.ts
// Target Issue: https://github.com/drizzle-team/drizzle-orm/issues/1083
// Author: Xuan Thinh (@thinhnx128) <thinhnx128@gmail.com>

export interface CustomTypeValues {
  data: unknown;
  driverData?: unknown;
  config?: unknown;
}

export interface CustomTypeParams<T extends CustomTypeValues> {
  dataType: (config?: T['config']) => string;
  toDriver?: (value: T['data']) => T['driverData'];
  fromDriver?: (value: T['driverData']) => T['data'];
  /**
   * Optional custom SQL expression wrapper used automatically when selecting this column from DB.
   * Solves PostGIS / geometry decoding (e.g. ST_AsText(column)) in both core and relational queries (#1083).
   */
  selectFromDb?: (columnIdentifier: string, fromDriverMapper?: (raw: T['driverData']) => T['data']) => {
    sqlFragment: string;
    alias: string;
    mapWith: (raw: T['driverData']) => T['data'];
  };
}

export function defineCustomTypeWithSelect<T extends CustomTypeValues>(params: CustomTypeParams<T>) {
  return {
    ...params,
    resolveSelectExpression(columnName: string) {
      const mapper = params.fromDriver ?? ((v: unknown) => v as T['data']);
      if (typeof params.selectFromDb === 'function') {
        return params.selectFromDb(columnName, mapper);
      }
      return {
        sqlFragment: `"${columnName}"`,
        alias: columnName,
        mapWith: mapper,
      };
    },
  };
}
