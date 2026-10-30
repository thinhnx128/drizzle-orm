import { describe, it, expect } from 'vitest';
import { withDefaultCustomSelect } from './custom-type-select';

describe('customType default select SQL transformer (#1083)', () => {
  it('applies selectSQL wrapper such as ST_AsText(col) when configured', () => {
    const sql = withDefaultCustomSelect(
      {
        dataType: () => 'geometry(Point, 4326)',
        selectSQL: (col) => `ST_AsText(${col})`
      },
      '"locations"."coords"'
    );
    expect(sql).toBe('ST_AsText("locations"."coords")');
  });
});
