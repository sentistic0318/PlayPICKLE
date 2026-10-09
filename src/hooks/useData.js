import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { explain } from '../lib/api';
export function useData(loader,deps=[],tables=[]){
 const key=JSON.stringify(deps),tableKey=tables.join(',');
 const fn=useRef(loader),requestKey=useRef(key),generation=useRef(0),mounted=useRef(false);
 const [result,setResult]=useState({key:null,data:null,error:''});
 useEffect(()=>{fn.current=loader;requestKey.current=key;});
 const fetchData=useCallback(async()=>{
  const n=++generation.current,startedKey=requestKey.current;
  try{const data=await fn.current();if(mounted.current&&n===generation.current)setResult({key:startedKey,data,error:''});}
  catch(error){if(mounted.current&&n===generation.current)setResult({key:startedKey,data:null,error:explain(error)});}
 },[]);
 useEffect(()=>{mounted.current=true;fetchData();return()=>{mounted.current=false;generation.current++;};},[key,fetchData]);
 useEffect(()=>{if(!supabase||!tableKey)return;const channel=supabase.channel('feed:'+tableKey+':'+Math.random());
 tableKey.split(',').forEach(table=>channel.on('postgres_changes',{event:'*',schema:'public',table},fetchData));channel.subscribe();
 return()=>{supabase.removeChannel(channel);};},[tableKey,fetchData]);
 return {data:result.key===key?result.data:null,loading:result.key!==key,error:result.key===key?result.error:'',reload:fetchData};
}
