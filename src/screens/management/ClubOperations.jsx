import { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Body, Button, Card, Empty, Field } from '../../components/ui';
import { query, rpc } from '../../lib/api';
import { chooseAndUploadImage } from '../../lib/images';
import { useData } from '../../hooks/useData';
import { Chips, DateRange, FetchState, FormCard, Stack, Toggle, localDay, localTime, number, required, styles, timeRange, useAction } from './shared';

export function ClubProfile({ club, reload }) {
  const [form, setForm] = useState({ name: club.name, description: club.description || '', area: club.area, address: club.address, timezone: club.timezone, facilities: (club.facilities || []).join(', '), photo_url: club.photo_url || '', booking_duration_minutes: String(club.booking_duration_minutes || 60), cancellation_hours: String(club.cancellation_hours ?? 24) });
  const set = key => value => setForm(previous => ({ ...previous, [key]: value }));
  const action = useAction(reload);
  return <FormCard title="Your club, at a glance">
    <Field label="Club name" value={form.name} onChangeText={set('name')} />
    <Field label="About your club" value={form.description} onChangeText={set('description')} multiline />
    <Field label="Area / city" value={form.area} onChangeText={set('area')} />
    <Field label="Street address" value={form.address} onChangeText={set('address')} multiline />
    <Field label="IANA time zone" value={form.timezone} onChangeText={set('timezone')} autoCapitalize="none" />
    <Field label="Facilities • separate with commas" value={form.facilities} onChangeText={set('facilities')} placeholder="Parking, equipment rental, showers" />
    <Button title="Upload a club photo" variant="secondary" loading={action.busy} onPress={() => action.run(async () => { const url=await chooseAndUploadImage('club-images',club.id); if(!url)throw new Error('Photo selection cancelled. No changes saved.');set('photo_url')(url); }, 'Photo uploaded. Save the club profile to publish it.')} />
    <Field label="Club image URL • optional HTTPS link" value={form.photo_url} onChangeText={set('photo_url')} autoCapitalize="none" keyboardType="url" />
    <Field label="Booking duration in minutes" value={form.booking_duration_minutes} onChangeText={set('booking_duration_minutes')} keyboardType="number-pad" />
    <Field label="Cancellation notice in hours" value={form.cancellation_hours} onChangeText={set('cancellation_hours')} keyboardType="number-pad" />
    {action.feedback}<Button title="Save club profile" loading={action.busy} onPress={() => action.run(async () => {
      new Intl.DateTimeFormat('en', { timeZone: required(form.timezone, 'Time zone') });
      if (form.photo_url && !/^https:\/\//.test(form.photo_url)) throw new Error('Use an HTTPS image URL.');
      await rpc('update_club', { p_club_id: club.id, p_details: { ...form, name: required(form.name, 'Club name'), area: required(form.area, 'Area'), address: required(form.address, 'Address'), facilities: form.facilities.split(',').map(value => value.trim()).filter(Boolean), booking_duration_minutes: number(form.booking_duration_minutes, 'Booking duration', 15, 480, true), cancellation_hours: number(form.cancellation_hours, 'Cancellation notice', 0, 720), photo_url: form.photo_url || null } });
    }, 'Club profile updated.')} />
  </FormCard>;
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function HoursForm({ club, hours, reload }) {
  const [days, setDays] = useState(() => weekdays.map((label, weekday) => {
    const existing = hours.find(item => item.weekday === weekday);
    return { weekday, label, enabled: Boolean(existing), opens_at: existing?.opens_at?.slice(0, 5) || '08:00', closes_at: existing?.closes_at?.slice(0, 5) || '22:00' };
  }));
  const update = (weekday, key, value) => setDays(previous => previous.map(item => item.weekday === weekday ? { ...item, [key]: value } : item));
  const action = useAction(reload);
  return <FormCard title="Weekly opening hours"><Body>Times use {club.timezone}. Switch a day off to close the club on that day.</Body>
    {days.map(item => <View key={item.weekday} style={styles.stack}><View style={styles.row}><Text style={styles.label}>{item.label}</Text><Chips items={[{ label: 'Open', value: true }, { label: 'Closed', value: false }]} value={item.enabled} onChange={value => update(item.weekday, 'enabled', value)} /></View>{item.enabled ? <><Field label={item.label + ' opens • HH:MM'} value={item.opens_at} onChangeText={value => update(item.weekday, 'opens_at', value)} /><Field label={item.label + ' closes • HH:MM'} value={item.closes_at} onChangeText={value => update(item.weekday, 'closes_at', value)} /></> : null}</View>)}
    {action.feedback}<Button title="Save opening hours" loading={action.busy} onPress={() => action.run(async () => {
      const hours = days.filter(item => item.enabled).map(({ weekday, opens_at, closes_at }) => {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(opens_at) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closes_at) || closes_at <= opens_at) throw new Error(weekdays[weekday] + ': enter valid hours with closing after opening.');
        return { weekday, opens_at, closes_at };
      });
      await rpc('set_opening_hours', { p_club_id: club.id, p_hours: hours });
    }, 'Opening hours saved.')} />
  </FormCard>;
}

function CourtForm({ club, court, reload }) {
  const [form, setForm] = useState({ name: court?.name || '', surface: court?.surface || '', indoor: court?.indoor || false, active: court?.active ?? true, price_per_hour: String(court?.price_per_hour || 0), currency: court?.currency || 'PHP' });
  const set = key => value => setForm(previous => ({ ...previous, [key]: value }));
  const action = useAction(reload);
  return <FormCard title={court ? 'Edit ' + court.name : 'Add a court'}>
    <Field label="Court name" value={form.name} onChangeText={set('name')} />
    <Field label="Surface" value={form.surface} onChangeText={set('surface')} placeholder="Acrylic" />
    <Toggle label="Indoor court" value={form.indoor} onChange={set('indoor')} />
    <Toggle label="Available for reservations" value={form.active} onChange={set('active')} />
    <Field label="Reference price per hour" value={form.price_per_hour} onChangeText={set('price_per_hour')} keyboardType="decimal-pad" />
    <Field label="Currency • 3-letter code" value={form.currency} onChangeText={value => set('currency')(value.toUpperCase())} autoCapitalize="characters" maxLength={3} />
    <Body>Payments are arranged directly with your club.</Body>
    {action.feedback}<Button title={court ? 'Save court' : 'Create court'} loading={action.busy} onPress={() => action.run(async () => {
      if (!/^[A-Z]{3}$/.test(form.currency)) throw new Error('Enter a 3-letter currency code.');
      await rpc('save_court', { p_club_id: club.id, p_court_id: court?.id || null, p_details: { ...form, name: required(form.name, 'Court name'), price_per_hour: number(form.price_per_hour, 'Price') } });
    }, 'Court saved.')} />
  </FormCard>;
}
function Blocks({ club, courts }) {
  const [courtId, setCourtId] = useState(courts[0]?.id);
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [reason, setReason] = useState('');
  const blocks = useData(async () => {
    if (!courtId) return [];
    return query('court_usage', { filters: { court_id: courtId, kind: 'block', active: true }, order: 'starts_at' });
  }, [courtId], ['court_usage']);
  const action = useAction(blocks.reload);
  if (!courts.length) return <Empty title="Add your first court" message="Once a court exists, you can block maintenance, private events, and closure dates." />;
  return <Stack><FormCard title="Block court time">
    <Chips items={courts.map(court => ({ value: court.id, label: court.name }))} value={courtId} onChange={setCourtId} />
    <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} timezone={club.timezone} />
    <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Maintenance, holiday closure…" />
    {action.feedback}<Button title="Add block" loading={action.busy} onPress={() => action.run(async () => {
      const range = timeRange(start, end);
      await rpc('add_block', { p_court_id: courtId, p_starts_at: range.starts_at, p_ends_at: range.ends_at, p_reason: required(reason, 'Reason') });
    }, 'Court time blocked.')} />
  </FormCard><FetchState state={blocks} empty={<Empty title="No active blocks" message="All unreserved opening hours remain available." />}>{(blocks.data || []).map(block => <Card key={block.id}><Stack><Text style={styles.label}>{block.reason}</Text><Body>{localTime(block.starts_at, club.timezone)} — {localTime(block.ends_at, club.timezone)}</Body><Button title="Remove block" variant="secondary" disabled={action.busy} onPress={() => action.run(() => rpc('remove_block', { p_usage_id: block.id }), 'Block removed.')} /></Stack></Card>)}</FetchState></Stack>;
}
export function CourtPanel({ club }) {
  const [section, setSection] = useState('courts'); const [courtId, setCourtId] = useState('new');
  const state = useData(async () => {
    const [courts, hours] = await Promise.all([query('courts', { filters: { club_id: club.id }, order: 'name' }), query('opening_hours', { filters: { club_id: club.id }, order: 'weekday' })]);
    return { courts, hours };
  }, [club.id], ['courts', 'opening_hours']);
  return <Stack><Chips items={[{ value: 'courts', label: 'Courts' }, { value: 'hours', label: 'Opening hours' }, { value: 'blocks', label: 'Closures & blocks' }]} value={section} onChange={setSection} />
    <FetchState state={state}>{state.data ? <>
      {section === 'courts' ? <Stack><Chips items={[{ value: 'new', label: '+ Add court' }, ...state.data.courts.map(court => ({ value: court.id, label: court.name + (court.active ? '' : ' · closed') }))]} value={courtId} onChange={setCourtId} /><CourtForm key={courtId} club={club} court={state.data.courts.find(court => court.id === courtId)} reload={state.reload} /></Stack> : null}
      {section === 'hours' ? <HoursForm key={JSON.stringify(state.data.hours)} club={club} hours={state.data.hours} reload={state.reload} /> : null}
      {section === 'blocks' ? <Blocks club={club} courts={state.data.courts} /> : null}
    </> : null}</FetchState>
  </Stack>;
}

function BookingRecord({ booking, club, courts, reload }) {
  const [cancelling, setCancelling] = useState(false); const [reason, setReason] = useState('');
  const action = useAction(reload);
  return <Card><Stack><View style={styles.row}><Text style={styles.label}>{courts.find(court => court.id === booking.court_id)?.name || 'Court reservation'}</Text><Badge>{booking.status}</Badge></View>
    <Body>{localTime(booking.starts_at, club.timezone)} — {localTime(booking.ends_at, club.timezone)}</Body>
    <Text selectable style={styles.small}>Player: {booking.player_name || booking.user_id}</Text><Text selectable style={styles.small}>Booking: {booking.id}</Text>
    <Body>{booking.currency} {booking.price_total} · pay the club directly</Body>
    {booking.cancellation_reason ? <Body>Cancellation: {booking.cancellation_reason}</Body> : null}
    {booking.status === 'confirmed' && !cancelling ? <Button title="Cancel reservation" variant="secondary" onPress={() => setCancelling(true)} /> : null}
    {cancelling && booking.status === 'confirmed' ? <><Field label="Cancellation reason • sent to the player" value={reason} onChangeText={setReason} multiline /><Button title="Confirm cancellation" loading={action.busy} onPress={() => action.run(() => rpc('cancel_booking', { p_booking_id: booking.id, p_reason: required(reason, 'Reason') }), 'Reservation cancelled.')} /><Button title="Keep reservation" variant="secondary" disabled={action.busy} onPress={() => setCancelling(false)} /></> : null}
    {action.feedback}
  </Stack></Card>;
}
export function BookingPanel({ club }) {
  const [mode, setMode] = useState('day'); const [date, setDate] = useState(localDay(new Date(), club.timezone));
  const state = useData(async () => {
    const [bookings, courts] = await Promise.all([rpc('club_bookings', { p_club_id: club.id }), query('courts', { filters: { club_id: club.id } })]);
    return { bookings, courts };
  }, [club.id], ['bookings', 'court_usage']);
  const bookings = (state.data?.bookings || []).filter(item => mode === 'history' || localDay(item.starts_at, club.timezone) === date);
  return <Stack><Text style={styles.heading}>Court reservations</Text><Chips items={[{ value: 'day', label: 'Daily schedule' }, { value: 'history', label: 'Recent records' }]} value={mode} onChange={setMode} />
    {mode === 'day' ? <><Field label={'Calendar date • ' + club.timezone} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" /><Body>Appointments are shown in club-local time.</Body></> : null}
    <FetchState state={state}>{bookings.length ? bookings.map(booking => <BookingRecord key={booking.id} booking={booking} club={club} courts={state.data.courts} reload={state.reload} />) : <Empty title="No reservations here" message={mode === 'day' ? 'Choose another day or open recent records.' : 'Confirmed and cancelled reservations will appear here.'} />}</FetchState>
  </Stack>;
}
const permissions = ['profile', 'courts', 'bookings', 'tournaments', 'results', 'staff'];
export function StaffPanel({ club }) {
  const [email, setEmail] = useState(''); const [selected, setSelected] = useState(['bookings']);
  const state = useData(async () => {
    const [members, invitations] = await Promise.all([query('club_members', { filters: { club_id: club.id } }), query('staff_invitations', { filters: { club_id: club.id } })]);
    return { members, invitations };
  }, [club.id], ['club_members', 'staff_invitations']);
  const action = useAction(state.reload);
  return <Stack><FormCard title="Invite your team"><Body>Invite by email. Staff accept from their profile, and receive only the permissions you select.</Body>
    <Field label="Staff email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
    <View style={styles.row}>{permissions.map(permission => <Chips key={permission} items={[permission]} value={selected.includes(permission) ? permission : null} onChange={() => setSelected(previous => previous.includes(permission) ? previous.filter(item => item !== permission) : [...previous, permission])} />)}</View>
    {action.feedback}<Button title="Send staff invitation" loading={action.busy} onPress={() => action.run(async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid email address.');
      if (!selected.length) throw new Error('Choose at least one permission.');
      await rpc('invite_staff', { p_club_id: club.id, p_email: email.trim(), p_permissions: selected }); setEmail('');
    }, 'Invitation saved. The staff member can accept it in their profile.')} />
  </FormCard>
    <FetchState state={state}>{state.data ? <Stack><Text style={styles.heading}>Club members</Text>{state.data.members.map(member => <Card key={member.user_id}><Stack><Badge>{member.role}</Badge><Text selectable style={styles.small}>{member.user_id}</Text><Body>{member.role === 'owner' ? 'Full club access' : member.permissions.join(' · ')}</Body>{member.role !== 'owner' ? <Button title="Revoke staff access" variant="secondary" disabled={action.busy} onPress={() => action.run(() => rpc('revoke_staff', { p_club_id: club.id, p_user_id: member.user_id }), 'Staff access revoked.')} /> : null}</Stack></Card>)}
      <Text style={styles.heading}>Invitations</Text>{state.data.invitations.length ? state.data.invitations.map(invite => <Card key={invite.id}><Stack><Text style={styles.label}>{invite.email}</Text><Badge>{invite.status || (invite.accepted_at ? 'accepted' : 'pending')}</Badge><Body>{invite.permissions.join(' · ')}</Body></Stack></Card>) : <Empty title="No invitations" message="Invite your first staff member above." />}
    </Stack> : null}</FetchState>
  </Stack>;
}
