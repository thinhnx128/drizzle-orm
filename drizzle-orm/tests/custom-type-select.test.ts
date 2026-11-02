import { describe, expect, it } from 'vitest';
import { eq } from '~/expressions.ts';
import { alias as gelAlias, customType as gelCustomType, gelTable, integer as gelInt } from '~/gel-core/index.ts';
import { GelDialect } from '~/gel-core/dialect.ts';
import { GelSelectBuilder } from '~/gel-core/query-builders/select.ts';
import { alias as mysqlAlias, customType as mysqlCustomType, int as mysqlInt, mysqlTable } from '~/mysql-core/index.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import { MySqlSelectBuilder } from '~/mysql-core/query-builders/select.ts';
import { alias as pgAlias, customType as pgCustomType, pgTable, serial } from '~/pg-core/index.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgSelectBuilder } from '~/pg-core/query-builders/select.ts';
import {
	alias as singleStoreAlias,
	customType as singleStoreCustomType,
	int as singleStoreInt,
	singlestoreTable,
} from '~/singlestore-core/index.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import { SingleStoreSelectBuilder } from '~/singlestore-core/query-builders/select.ts';
import { sql, type SQL } from '~/sql/sql.ts';
import {
	alias as sqliteAlias,
	customType as sqliteCustomType,
	integer as sqliteInt,
	sqliteTable,
} from '~/sqlite-core/index.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteSelectBuilder } from '~/sqlite-core/query-builders/select.ts';

interface Point {
	lng: number;
	lat: number;
}

describe('customType selectFromDb', () => {
	it('PostgreSQL: wraps custom column in single-table select, join select, and table alias', () => {
		const customPoint = pgCustomType<{ data: Point; driverData: string }>({
			dataType() {
				return 'geometry(Point, 4326)';
			},
			toDriver(point: Point): SQL {
				return sql`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)`;
			},
			selectFromDb(column: SQL): SQL {
				return sql`ST_AsText(${column})`;
			},
			fromDriver(value: string): Point {
				const match = value.match(/^POINT\(([-\d.]+)\s+([-\d.]+)\)$/i);
				if (!match) {
					throw new Error(`Invalid WKT Point: ${value}`);
				}
				return { lng: Number(match[1]), lat: Number(match[2]) };
			},
		});

		const places = pgTable('places', {
			id: serial('id').primaryKey(),
			location: customPoint('location').notNull(),
		});

		const categories = pgTable('categories', {
			id: serial('id').primaryKey(),
		});

		const dialect = new PgDialect();

		// 1. Single-table select
		const singleSelectSql = new PgSelectBuilder({ fields: undefined, session: undefined as any, dialect })
			.from(places)
			.getSQL();
		expect(dialect.sqlToQuery(singleSelectSql)).toEqual({
			sql: 'select "id", ST_AsText("location") from "places"',
			params: [],
		});

		// 2. Joined select (table-qualified column inside selectFromDb)
		const joinSelectSql = new PgSelectBuilder({
			fields: { id: places.id, location: places.location },
			session: undefined as any,
			dialect,
		})
			.from(places)
			.leftJoin(categories, eq(places.id, categories.id))
			.getSQL();
		expect(dialect.sqlToQuery(joinSelectSql)).toEqual({
			sql: 'select "places"."id", ST_AsText("places"."location") from "places" left join "categories" on "places"."id" = "categories"."id"',
			params: [],
		});

		// 3. Aliased table select
		const placesAlias = pgAlias(places, 'p');
		const aliasSelectSql = new PgSelectBuilder({
			fields: { id: placesAlias.id, location: placesAlias.location },
			session: undefined as any,
			dialect,
		})
			.from(placesAlias)
			.leftJoin(categories, eq(placesAlias.id, categories.id))
			.getSQL();
		expect(dialect.sqlToQuery(aliasSelectSql)).toEqual({
			sql: 'select "p"."id", ST_AsText("p"."location") from "places" "p" left join "categories" on "p"."id" = "categories"."id"',
			params: [],
		});

		// 4. Preserves fromDriver decoding
		expect(places.location.mapFromDriverValue('POINT(106.660172 10.762622)')).toEqual({
			lng: 106.660172,
			lat: 10.762622,
		});
	});

	it('MySQL: wraps custom column in single-table and joined select', () => {
		const binaryUuid = mysqlCustomType<{ data: string; driverData: string }>({
			dataType() {
				return 'binary(16)';
			},
			toDriver(value: string): SQL {
				return sql`UUID_TO_BIN(${value})`;
			},
			selectFromDb(column: SQL): SQL {
				return sql`BIN_TO_UUID(${column})`;
			},
		});

		const users = mysqlTable('users', {
			id: mysqlInt('id').primaryKey(),
			uuid: binaryUuid('uuid').notNull(),
		});
		const roles = mysqlTable('roles', {
			id: mysqlInt('id').primaryKey(),
		});

		const dialect = new MySqlDialect();

		const singleSelectSql = new MySqlSelectBuilder({ fields: undefined, session: undefined as any, dialect })
			.from(users)
			.getSQL();
		expect(dialect.sqlToQuery(singleSelectSql)).toEqual({
			sql: 'select `id`, BIN_TO_UUID(`uuid`) from `users`',
			params: [],
		});

		const usersAlias = mysqlAlias(users, 'u');
		const joinSelectSql = new MySqlSelectBuilder({
			fields: { id: usersAlias.id, uuid: usersAlias.uuid },
			session: undefined as any,
			dialect,
		})
			.from(usersAlias)
			.leftJoin(roles, eq(usersAlias.id, roles.id))
			.getSQL();
		expect(dialect.sqlToQuery(joinSelectSql)).toEqual({
			sql: 'select `u`.`id`, BIN_TO_UUID(`u`.`uuid`) from `users` `u` left join `roles` on `u`.`id` = `roles`.`id`',
			params: [],
		});
	});

	it('SQLite: wraps custom column in single-table and joined select', () => {
		const hexBlob = sqliteCustomType<{ data: string; driverData: string }>({
			dataType() {
				return 'blob';
			},
			selectFromDb(column: SQL): SQL {
				return sql`hex(${column})`;
			},
		});

		const items = sqliteTable('items', {
			id: sqliteInt('id').primaryKey(),
			payload: hexBlob('payload').notNull(),
		});
		const tags = sqliteTable('tags', {
			id: sqliteInt('id').primaryKey(),
		});

		const dialect = new SQLiteSyncDialect();

		const singleSelectSql = new SQLiteSelectBuilder({
			fields: undefined,
			session: undefined as any,
			dialect,
			resultType: 'all',
			isPartial: false,
		})
			.from(items)
			.getSQL();
		expect(dialect.sqlToQuery(singleSelectSql)).toEqual({
			sql: 'select "id", hex("payload") from "items"',
			params: [],
		});

		const itemsAlias = sqliteAlias(items, 'i');
		const joinSelectSql = new SQLiteSelectBuilder({
			fields: { id: itemsAlias.id, payload: itemsAlias.payload },
			session: undefined as any,
			dialect,
			resultType: 'all',
			isPartial: false,
		})
			.from(itemsAlias)
			.leftJoin(tags, eq(itemsAlias.id, tags.id))
			.getSQL();
		expect(dialect.sqlToQuery(joinSelectSql)).toEqual({
			sql: 'select "i"."id", hex("i"."payload") from "items" "i" left join "tags" on "i"."id" = "tags"."id"',
			params: [],
		});
	});

	it('SingleStore: wraps custom column in single-table and joined select', () => {
		const binaryUuid = singleStoreCustomType<{ data: string; driverData: string }>({
			dataType() {
				return 'binary(16)';
			},
			selectFromDb(column: SQL): SQL {
				return sql`BIN_TO_UUID(${column})`;
			},
		});

		const events = singlestoreTable('events', {
			id: singleStoreInt('id').primaryKey(),
			uuid: binaryUuid('uuid').notNull(),
		});
		const logs = singlestoreTable('logs', {
			id: singleStoreInt('id').primaryKey(),
		});

		const dialect = new SingleStoreDialect();

		const singleSelectSql = new SingleStoreSelectBuilder({ fields: undefined, session: undefined as any, dialect })
			.from(events)
			.getSQL();
		expect(dialect.sqlToQuery(singleSelectSql)).toEqual({
			sql: 'select `id`, BIN_TO_UUID(`uuid`) from `events`',
			params: [],
		});

		const eventsAlias = singleStoreAlias(events, 'e');
		const joinSelectSql = new SingleStoreSelectBuilder({
			fields: { id: eventsAlias.id, uuid: eventsAlias.uuid },
			session: undefined as any,
			dialect,
		})
			.from(eventsAlias)
			.leftJoin(logs, eq(eventsAlias.id, logs.id))
			.getSQL();
		expect(dialect.sqlToQuery(joinSelectSql)).toEqual({
			sql: 'select `e`.`id`, BIN_TO_UUID(`e`.`uuid`) from `events` `e` left join `logs` on `e`.`id` = `logs`.`id`',
			params: [],
		});
	});

	it('Gel: wraps custom column in select and aliased select', () => {
		const customGeo = gelCustomType<{ data: string; driverData: string }>({
			dataType() {
				return 'geometry';
			},
			selectFromDb(column: SQL): SQL {
				return sql`ST_AsText(${column})`;
			},
		});

		const nodes = gelTable('nodes', {
			id: gelInt('id').primaryKey(),
			geo: customGeo('geo').notNull(),
		});

		const dialect = new GelDialect();

		const selectSql = new GelSelectBuilder({ fields: undefined, session: undefined as any, dialect })
			.from(nodes)
			.getSQL();
		expect(dialect.sqlToQuery(selectSql)).toEqual({
			sql: 'select "nodes"."id", ST_AsText("nodes"."geo") from "nodes"',
			params: [],
		});

		const nodesAlias = gelAlias(nodes, 'n');
		const aliasSelectSql = new GelSelectBuilder({
			fields: { id: nodesAlias.id, geo: nodesAlias.geo },
			session: undefined as any,
			dialect,
		})
			.from(nodesAlias)
			.getSQL();
		expect(dialect.sqlToQuery(aliasSelectSql)).toEqual({
			sql: 'select "n"."id", ST_AsText("n"."geo") from "nodes" "n"',
			params: [],
		});
	});
});
