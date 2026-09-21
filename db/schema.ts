import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
 id:text('id').primaryKey(), email:text('email').notNull().unique(), name:text('name').notNull(), password:text('password').notNull(), settings:text('settings').notNull().default('{}'), keys:text('keys').notNull().default(''), created:integer('created').notNull(), suspended:integer('suspended').notNull().default(0),
});
export const sessions = sqliteTable('sessions', {
 hash:text('hash').primaryKey(), user:text('user').notNull().references(()=>users.id,{onDelete:'cascade'}), expires:integer('expires').notNull(),
},t=>[index('sessions_user').on(t.user)]);
export const items = sqliteTable('items', {
 id:text('id').primaryKey(), user:text('user').notNull().references(()=>users.id,{onDelete:'cascade'}), kind:text('kind').notNull(), data:text('data').notNull(), updated:integer('updated').notNull(),
},t=>[index('items_user_kind').on(t.user,t.kind)]);
export const assets = sqliteTable('assets', {
 id:text('id').primaryKey(),user:text('user').notNull().references(()=>users.id,{onDelete:'cascade'}),name:text('name').notNull(),type:text('type').notNull(),size:integer('size').notNull(),
},t=>[index('assets_user').on(t.user)]);
export const limits=sqliteTable('limits',{id:text('id').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
export const passwordResets=sqliteTable('password_resets',{
 hash:text('hash').primaryKey(),user:text('user').notNull().references(()=>users.id,{onDelete:'cascade'}),expires:integer('expires').notNull(),used:integer('used').notNull().default(0),
},t=>[index('password_resets_user').on(t.user)]);
