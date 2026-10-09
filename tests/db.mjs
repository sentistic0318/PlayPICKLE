import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs/promises';
export async function createTestDb(options={}){
 const db=new PGlite({extensions:{btree_gist}});
 await initializeTestDb(db,options);
 return db;
}
export const bootstrapSql=`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true),'email',current_setting('request.jwt.claim.email',true)) $$;
 grant usage on schema auth,public,storage to anon,authenticated,service_role;
 grant execute on all functions in schema auth to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
 grant all on storage.objects to authenticated,service_role;
 `;
export async function initializeTestDb(db,{migrationFilter=()=>true}={}) {
 await db.exec(bootstrapSql);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const file of (await fs.readdir(dir)).filter(f=>f.endsWith('.sql')&&migrationFilter(f)).sort()){
  try{await db.exec(await fs.readFile(new URL(file,dir),'utf8'));}catch(error){throw new Error(file+': '+error.message,{cause:error});}
 }
 return db;
}
export async function asUser(db,id,email,work){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",[id,email]);
 await db.exec('set role authenticated');
 try{return await work();}finally{await db.exec('reset role');}
}
export async function addUser(db,id,name='Player'){
 await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),jsonb_build_object('display_name',$3::text))",[id,id+'@example.test',name]);
 return {id,email:id+'@example.test'};
}
