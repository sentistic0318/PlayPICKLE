import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider,useAuth } from '../src/providers/AuthProvider';
import { Loading } from '../src/components/ui';
import {colors} from '../src/theme';
function Navigation(){const {session,loading}=useAuth();if(loading)return <Loading/>;return <Stack screenOptions={{headerStyle:{backgroundColor:colors.paper},headerTintColor:colors.forest,headerShadowVisible:false,contentStyle:{backgroundColor:colors.paper}}}>
 <Stack.Screen name="index" options={{headerShown:false}}/>
 <Stack.Screen name="auth" options={{headerShown:false}}/>
 <Stack.Protected guard={!!session}>
 <Stack.Screen name="(tabs)" options={{headerShown:false}}/>
 <Stack.Screen name="club/[id]" options={{title:'Explore the club'}}/>
 <Stack.Screen name="booking/[id]" options={{title:'Your reservation'}}/>
 <Stack.Screen name="tournament/[id]" options={{title:'Tournament'}}/>
 <Stack.Screen name="notifications" options={{title:'Your inbox'}}/>
 <Stack.Screen name="history" options={{title:'Your activity'}}/>
 <Stack.Screen name="manage" options={{title:'Club workspace'}}/>
 <Stack.Screen name="admin" options={{title:'Platform administration'}}/>
 </Stack.Protected>
 </Stack>;}
export default function Root(){return <SafeAreaProvider><AuthProvider><StatusBar style="dark"/><Navigation/></AuthProvider></SafeAreaProvider>;}
