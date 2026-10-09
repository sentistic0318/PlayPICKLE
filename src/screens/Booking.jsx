import React,{useEffect,useState} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {Screen,Title,Body,Card,Badge,DataState,Field,Button,Notice,Action} from '../components/ui';
import {query,rpc} from '../lib/api';
import {useData} from '../hooks/useData';
import {dateTime,money} from '../lib/format';
export default function Booking(){const {id}=useLocalSearchParams();const [confirm,setConfirm]=useState(false),[reason,setReason]=useState(''),[message,setMessage]=useState('');
 const state=useData(async()=>{const b=await query('bookings',{select:'*,clubs(*),courts(name)',filters:{id}});if(!b[0])throw new Error('Reservation not found or access unavailable.');return b[0];},[id],['bookings']);
 const [now,setNow]=useState(Date.now);useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 const b=state.data,canCancel=b&&b.status==='confirmed'&&new Date(b.starts_at).getTime()-now>b.cancellation_hours*3600000;
 return <Screen onRefresh={state.reload} refreshing={state.loading}><DataState state={state}>{b&&<><Badge>{b.status}</Badge><Title>{b.status==='confirmed'?"You're on the court.":'Reservation cancelled'}</Title><Card><Title style={{fontSize:24}}>{b.clubs.name}</Title><Body>{b.courts.name}</Body><Body>{dateTime(b.starts_at,b.clubs.timezone)}</Body><Body>Until {dateTime(b.ends_at,b.clubs.timezone)}</Body><Body>{b.clubs.timezone}</Body><Title style={{fontSize:26}}>{money(b.price_total,b.currency)}</Title><Body>Payment is handled by the club.</Body><Body>Booking reference: {b.id.slice(0,8).toUpperCase()}</Body></Card><Card><Body>{b.clubs.address}</Body><Body>Cancellation window: at least {b.cancellation_hours} hours before play.</Body></Card><Notice message={message} tone="success"/>
 {canCancel&&!confirm&&<Button title="Cancel reservation" variant="secondary" onPress={()=>setConfirm(true)}/>}
 {confirm&&canCancel&&<Card><Title style={{fontSize:22}}>Release this court?</Title><Body>Your time slot will become available to other players.</Body><Field label="Reason (optional)" value={reason} onChangeText={setReason}/><Action title="Confirm cancellation" variant="danger" run={()=>rpc('cancel_booking',{p_booking_id:id,p_reason:reason})} onDone={()=>{setMessage('Your reservation was cancelled.');setConfirm(false);state.reload();}}/><Button title="Keep my reservation" variant="ghost" onPress={()=>setConfirm(false)}/></Card>}
 {b.status==='confirmed'&&!canCancel&&<Notice message="The cancellation window has closed. Contact the club if you need help."/>}
 </>}</DataState></Screen>;
}
