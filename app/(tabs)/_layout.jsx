import React from 'react';
import {Tabs,router} from 'expo-router';
import {Pressable} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Brand} from '../../src/components/ui';
import {colors} from '../../src/theme';
const icons={index:'home-outline',courts:'tennisball-outline',tournaments:'trophy-outline',rankings:'podium-outline',profile:'person-outline'};
export default function TabLayout(){return <Tabs screenOptions={({route})=>({headerTitle:()=> <Brand/>,headerStyle:{backgroundColor:colors.white},headerShadowVisible:false,headerRight:()=> <Pressable accessibilityLabel="Open notifications" accessibilityRole="button" style={{padding:14,marginRight:6}} onPress={()=>router.push('/notifications')}><Ionicons name="notifications-outline" size={24} color={colors.forest}/></Pressable>,tabBarActiveTintColor:colors.forest,tabBarInactiveTintColor:colors.muted,tabBarStyle:{backgroundColor:colors.white,borderTopColor:colors.border,minHeight:68,paddingTop:9},tabBarLabelStyle:{fontSize:11,fontWeight:'600'},tabBarIcon:({color,size})=><Ionicons name={icons[route.name]} size={size} color={color}/>})}>
 <Tabs.Screen name="index" options={{title:'Home'}}/><Tabs.Screen name="courts" options={{title:'Courts'}}/><Tabs.Screen name="tournaments" options={{title:'Tournaments'}}/><Tabs.Screen name="rankings" options={{title:'Rankings'}}/><Tabs.Screen name="profile" options={{title:'Profile'}}/>
 </Tabs>;}
