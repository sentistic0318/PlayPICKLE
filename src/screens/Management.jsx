import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Empty, Field, Notice, Screen, Title, Badge } from '../components/ui';
import { configured } from '../lib/supabase';
import { query, rpc } from '../lib/api';
import { useData } from '../hooks/useData';
import { useAuth } from '../providers/AuthProvider';
import { Chips, FetchState, FormCard, Stack, required, styles, useAction } from './management/shared';
import { BookingPanel, ClubProfile, CourtPanel, StaffPanel } from './management/ClubOperations';
import TournamentPanel from './management/TournamentPanel';

function ClubApplication({ onDone }) {
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('Asia/Manila');
  const action = useAction(onDone);
  return <FormCard title="Bring your club to PlayPICKLE"><Body>Apply as the club owner. An administrator reviews your application before players can book.</Body>
    <Field label="Club name" value={name} onChangeText={setName} />
    <Field label="Area / city" value={area} onChangeText={setArea} />
    <Field label="Street address" value={address} onChangeText={setAddress} multiline />
    <Field label="IANA time zone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" />
    {action.feedback}
    <Button title="Submit club application" loading={action.busy} onPress={() => action.run(async () => {
      const zone = required(timezone, 'Time zone'); new Intl.DateTimeFormat('en', { timeZone: zone });
      await rpc('apply_club', { p_name: required(name, 'Club name'), p_area: required(area, 'Area'), p_address: required(address, 'Address'), p_timezone: zone });
      setName(''); setAddress('');
    }, 'Application submitted. Your club is pending review.')} />
  </FormCard>;
}
export default function Management() {
  const router = useRouter();
  const { user, memberships = [], isAdmin, refreshProfile } = useAuth();
  const [clubId, setClubId] = useState(null);
  const [section, setSection] = useState('profile');
  const [applying, setApplying] = useState(false);
  const state = useData(() => query('clubs', { order: 'name' }), [user?.id], ['clubs', 'club_members']);
  const clubs = (state.data || []).filter(club => club.owner_id === user?.id || memberships.some(member => member.club_id === club.id) || isAdmin);
  const club = clubs.find(item => item.id === clubId) || clubs[0];
  const member = memberships.find(item => item.club_id === club?.id);
  const can = permission => isAdmin || club?.owner_id === user?.id || member?.role === 'owner' || member?.permissions?.includes(permission);
  const panels = [{ value: 'profile', label: 'Club', permission: 'profile' }, { value: 'courts', label: 'Courts & hours', permission: 'courts' }, { value: 'bookings', label: 'Bookings', permission: 'bookings' }, { value: 'events', label: 'Tournaments', permission: 'tournaments' }, { value: 'results', label: 'Results', permission: 'results' }, { value: 'staff', label: 'Staff', permission: 'staff' }].filter(item => can(item.permission));
  const currentSection = panels.some(item => item.value === section) ? section : panels[0]?.value;
  if (!configured) return <Screen><Title>Club operations</Title><Empty title="Connect your club" message="Supabase configuration is required before applications and club management are available." /></Screen>;
  if (!user) return <Screen><Title>Club operations</Title><Body>Sign in to apply for a club or access your staff workspace.</Body><Button title="Sign in" onPress={() => router.push('/auth/sign-in')} /></Screen>;
  return <Screen><Title>Club operations</Title><Body>Your courts. Your community.</Body>
    <FetchState state={state} empty={<ClubApplication onDone={async () => { await refreshProfile(); state.reload(); }} />}>
      <Stack>{clubs.length ? <><Chips items={clubs.map(item => ({ value: item.id, label: item.name }))} value={club?.id} onChange={id => { setClubId(id); setApplying(false); }} />
        <Card><Stack><View style={styles.row}><Text style={styles.heading}>{club.name}</Text><Badge>{club.verification_status}</Badge></View><Body>{club.area} · {club.timezone}</Body>{club.verification_reason ? <Notice message={club.verification_reason} /> : null}{club.verification_status !== 'verified' ? <Body>Complete your club details while your application is reviewed. Public booking requires verification.</Body> : null}</Stack></Card>
        {panels.length ? <Chips items={panels} value={currentSection} onChange={setSection} /> : <Notice message="Your membership has no management permissions. Ask the owner to update your access." />}
        <View key={club.id + currentSection}>{currentSection === 'profile' ? <ClubProfile club={club} reload={state.reload} /> : null}{currentSection === 'courts' ? <CourtPanel club={club} /> : null}{currentSection === 'bookings' ? <BookingPanel club={club} /> : null}{currentSection === 'staff' ? <StaffPanel club={club} /> : null}{currentSection === 'events' || currentSection === 'results' ? <TournamentPanel club={club} canManage={can('tournaments')} canResults={can('results')} /> : null}</View>
      </> : <Empty title="Make room for more play" message="Apply for your club below, or accept a staff invitation from your profile." />}
      <Button title={applying ? 'Close application form' : 'Apply for another club'} variant="secondary" onPress={() => setApplying(value => !value)} />
      {(applying || !clubs.length) ? <ClubApplication onDone={async () => { await refreshProfile(); await state.reload(); setApplying(false); }} /> : null}</Stack>
    </FetchState>
  </Screen>;
}
