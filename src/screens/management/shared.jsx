import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Chip, Empty, Field, Notice } from '../../components/ui';
import { colors } from '../../theme';

export const styles = StyleSheet.create({
  stack: { gap: 16 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  heading: { fontSize: 22, lineHeight: 28, color: colors.ink, fontWeight: '800' },
  label: { fontSize: 16, lineHeight: 23, color: colors.ink, fontWeight: '700' },
  muted: { fontSize: 15, lineHeight: 22, color: colors.muted },
  small: { fontSize: 14, lineHeight: 21, color: colors.muted },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
});
export function Stack({ children }) { return <View style={styles.stack}>{children}</View>; }
export function Chips({ items, value, onChange }) {
  return <View style={styles.row}>{items.map(item => {
    const option = typeof item === 'string' ? { label: item, value: item } : item;
    return <Chip key={option.value} label={option.label} selected={value === option.value} onPress={() => onChange(option.value)} />;
  })}</View>;
}
export function Toggle({ label, value, onChange }) {
  return <View style={styles.stack}><Text style={styles.label}>{label}</Text><Chips items={[{ label: 'Yes', value: true }, { label: 'No', value: false }]} value={value} onChange={onChange} /></View>;
}
export function useAction(onDone) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const run = async (work, success = 'Saved.') => {
    if (busy) return false;
    setBusy(true); setError(''); setMessage('');
    try { await work(); if (onDone) await onDone(); setMessage(success); return true; }
    catch (e) { setError(e.message || 'Unable to save. Check your connection and try again.'); return false; }
    finally { setBusy(false); }
  };
  return { busy, run, feedback: <>{error ? <Notice message={error} tone="error" /> : null}{message ? <Notice message={message} tone="success" /> : null}</> };
}
export function FetchState({ state, empty, children }) {
  if (state.loading && !state.data) return <ActivityIndicator color={colors.forest} accessibilityLabel="Loading records" />;
  if (state.error) return <Stack><Notice message={state.error.message || String(state.error)} tone="error" /><Button title="Try again" variant="secondary" onPress={state.reload} /></Stack>;
  if (!state.data || (Array.isArray(state.data) && !state.data.length)) return empty || <Empty title="Nothing here yet" message="New records will appear here." />;
  return children;
}
export function FormCard({ title, children }) { return <Card><Stack>{title ? <Text style={styles.heading}>{title}</Text> : null}{children}</Stack></Card>; }
export function required(value, label) {
  if (!String(value || '').trim()) throw new Error(label + ' is required.');
  return String(value).trim();
}
export function number(value, label, min = 0, max = 100000, integer = false) {
  if (String(value).trim() === '') throw new Error(label + ' is required.');
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) throw new Error(label + ' must be ' + (integer ? 'a whole number ' : '') + 'between ' + min + ' and ' + max + '.');
  return parsed;
}
export function timestamp(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.trim())) throw new Error(label + ': use YYYY-MM-DDTHH:MM+08:00, with the correct UTC offset.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(label + ' is not a valid date.');
  return date.toISOString();
}
export function day(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new Error(label + ': use a valid YYYY-MM-DD date.');
  return value;
}
export function timeRange(start, end) {
  const starts_at = timestamp(start, 'Start time');
  const ends_at = timestamp(end, 'End time');
  if (ends_at <= starts_at) throw new Error('End time must be after start time.');
  return { starts_at, ends_at };
}
export function localTime(value, timezone = 'UTC') {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleString(undefined, { timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function localDay(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = name => parts.find(item => item.type === name).value;
  return part('year') + '-' + part('month') + '-' + part('day');
}
export function DateRange({ start, end, setStart, setEnd, timezone }) {
  return <Stack><Body>Club time zone: {timezone}. Include the local UTC offset so daylight-saving dates stay accurate.</Body><Field label="Start • YYYY-MM-DDTHH:MM+08:00" value={start} onChangeText={setStart} autoCapitalize="none" placeholder="2026-10-15T09:00+08:00" /><Field label="End • YYYY-MM-DDTHH:MM+08:00" value={end} onChangeText={setEnd} autoCapitalize="none" placeholder="2026-10-15T10:00+08:00" /></Stack>;
}
