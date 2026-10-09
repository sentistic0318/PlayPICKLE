import React,{useState} from 'react';
import {Image,View} from 'react-native';
import {router} from 'expo-router';
import {Screen,Eyebrow,Title,Body,Field,Card,Badge,Row,Chip,DataState,Empty} from '../components/ui';
import {useData} from '../hooks/useData';
import {query} from '../lib/api';
import {useAuth} from '../providers/AuthProvider';
import {colors} from '../theme';
export default function Courts(){
 const {profile}=useAuth();const [search,setSearch]=useState(''),[area,setArea]=useState(profile?.home_area||process.env.EXPO_PUBLIC_DEFAULT_AREA||''),[filter,setFilter]=useState('All courts');
 const state=useData(()=>query('clubs',{select:'*,courts(*)',filters:{verification_status:'verified'},order:'name'}),[],['clubs','courts']);
 const visible=state.data?.filter(c=>(c.name+' '+c.address).toLowerCase().includes(search.toLowerCase())&&c.area.toLowerCase().includes(area.toLowerCase())&&(filter==='All courts'||c.courts?.some(x=>x.active&&x.indoor===(filter==='Indoor'))));
 return <Screen refreshing={state.loading} onRefresh={state.reload}><Eyebrow>MAKE TIME TO PLAY</Eyebrow><Title>Find your court.</Title><Body style={{color:colors.muted}}>Great games start at a local club.</Body><Field label="Search clubs" placeholder="Club name or address" value={search} onChangeText={setSearch}/><Field label="Your area" placeholder="Choose an area, or leave blank for all" value={area} onChangeText={setArea}/><Row>{['All courts','Indoor','Outdoor'].map(x=><Chip key={x} label={x} selected={filter===x} onPress={()=>setFilter(x)}/>)}</Row>
 <DataState state={state} emptyTitle="Your community is taking shape" emptyMessage="Verified participating clubs will appear here.">{visible?.length===0?<Empty title="No clubs match yet" message="Try another area or clear your filters."/>:visible?.map(c=><Card key={c.id} onPress={()=>router.push('/club/'+c.id)} style={{padding:0,overflow:'hidden'}}>{c.photo_url?<Image source={{uri:c.photo_url}} style={{width:'100%',height:170}} resizeMode="cover" accessibilityLabel={c.name}/>:<View style={{backgroundColor:colors.soft,padding:22,height:105,justifyContent:'center'}}><Eyebrow>YOUR LOCAL COURT COMMUNITY</Eyebrow><Body style={{fontSize:28,color:colors.forest,fontWeight:'800'}}>Let’s play.</Body></View>}<View style={{padding:20,gap:9}}><Row><Badge>Verified club</Badge><Body style={{color:colors.muted,fontSize:14}}>{c.area}</Body></Row><Title style={{fontSize:24}}>{c.name}</Title><Body style={{color:colors.muted}}>{c.address}</Body><Row><Body>{c.courts?.filter(x=>x.active).length||0} courts</Body><Body>· {c.booking_duration_minutes} min sessions</Body></Row><Body style={{color:colors.forest,fontWeight:'700'}}>See courts & availability →</Body></View></Card>)}</DataState></Screen>;
}
