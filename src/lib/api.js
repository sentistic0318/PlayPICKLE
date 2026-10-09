import { supabase } from './supabase';
export function client(){if(!supabase)throw new Error('Connect your Supabase project first. See README → Supabase setup.');return supabase;}
export function explain(error){
 if(error?.code==='23P01')return 'That court was just reserved. Refresh availability and choose another time.';
 if(error?.code==='23505')return 'This record already exists. Refresh to see its current status.';
 if(error?.code==='42501')return 'Your account does not have permission for this action.';
 if(/fetch|network/i.test(error?.message||''))return 'Cannot reach PlayPICKLE. Check your connection and try again.';
 return error?.message || 'Something went wrong. Please try again.';
}
export async function unwrap(request){const {data,error}=await request;if(error)throw new Error(explain(error));return data;}
export async function rpc(name,args={}){return unwrap(client().rpc(name,args));}
export async function query(table,{select='*',filters={},order,limit=100}={}){
 let q=client().from(table).select(select);
 for(const [key,value] of Object.entries(filters)){if(value&&typeof value==='object'&&!Array.isArray(value)){for(const [operator,operand] of Object.entries(value)){if(!['gte','gt','lte','lt','neq'].includes(operator))throw new Error('Invalid query filter.');q=q[operator](key,operand);}}else q=value===null?q.is(key,null):Array.isArray(value)?q.in(key,value):q.eq(key,value);}
 if(order)q=q.order(typeof order==='string'?order:order.column,{ascending:typeof order==='string'?true:order.ascending!==false});
 return unwrap(q.limit(limit));
}

// Keyset pagination also handles server page caps smaller than our requested size.
// UUID order is stable across pages; presentation ordering is applied afterwards.
export async function queryAll(table, options={}) {
 const rows=[];let after=null;
 for (;;) {
  const page=await query(table,{...options,filters:{...options.filters,...(after?{id:{gt:after}}:{})},order:'id',limit:100});
  if (!page.length) return rows;
  const next=page[page.length-1].id;
  if (!next || (after && next<=after)) throw new Error('Unable to load the complete dataset. Please refresh.');
  rows.push(...page);after=next;
 }
}
