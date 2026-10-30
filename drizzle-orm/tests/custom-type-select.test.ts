// File: drizzle-orm/tests/custom-type-select.test.ts
import { describe, it, expect } from 'vitest';
import { defineCustomTypeWithSelect } from '../src/custom-type-select';

type Point = { lat: number; lng: number };

describe('CustomType selectFromDb wrapper (drizzle-team/drizzle-orm#1083)', () => {
  it('automatically wraps PostGIS geometry column with ST_AsText on select and maps via fromDriver', () => {
    const pointType = defineCustomTypeWithSelect<{ data: Point; driverData: string }>({
      dataType() {
        return 'geometry(Point,4326)';
      },
      toDriver(value: Point): string {
        return `SRID=4326;POINT(${value.lng} ${value.lat})`;
      },
      fromDriver(value: string): Point {
        const matches = value.match(/POINT\((?<lng>[\d.-]+) (?<lat>[\d.-]+)\)/);
        const { lat, lng } = matches?.groups ?? {};
        return { lat: parseFloat(String(lat)), lng: parseFloat(String(lng)) };
      },
      selectFromDb(column, decoder) {
        return {
          sqlFragment: `st_astext("${column}")`,
          alias: column,
          mapWith: decoder!,
        };
      },
    });

    const expr = pointType.resolveSelectExpression('coords');
    expect(expr.sqlFragment).toBe('st_astext("coords")');
    expect(expr.alias).toBe('coords');
    expect(expr.mapWith('POINT(106.660172 10.762622)')).toEqual({
      lat: 10.762622,
      lng: 106.660172,
    });
  });
});
