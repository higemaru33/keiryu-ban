import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';
const LAT = 34.48;
const LNG = 134.08;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getRisk(height: number, direction: number, period: number) {
  const isSouth = direction >= 150 && direction <= 220;
  const isSwell = period >= 8;
  if (isSouth && isSwell && height >= 0.8) return 'high';
  if (isSouth && isSwell && height >= 0.4) return 'mid';
  return 'low';
}

function getRiskColor(risk: string) {
  return risk === 'high' ? '#E24B4A' : risk === 'mid' ? '#EF9F27' : '#639922';
}

function getRiskLabel(risk: string) {
  return risk === 'high' ? '避難' : risk === 'mid' ? '注意' : 'OK';
}

function getDayLabel(dateStr: string, index: number) {
  if (index === 0) return '今日';
  if (index === 1) return '明日';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type LogEntry = {
  date: string;
  height: number;
  direction: number;
  period: number;
  shook: boolean;
};

export default function App() {
  const [current, setCurrent] = useState<{height:number, direction:number, period:number} | null>(null);
  const [forecast, setForecast] = useState<{date:string, height:number, direction:number, period:number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [notifScheduled, setNotifScheduled] = useState(false);

  useEffect(() => {
    loadLogs();
    requestNotifPermission();
    fetchSwell();
  }, []);

  async function requestNotifPermission() {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      scheduleDaily17();
    }
  }

  async function scheduleDaily17() {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '係留番',
        body: '今日のうねり予報を確認してください',
      },
      trigger: {
        hour: 17,
        minute: 0,
        repeats: true,
      } as any,
    });
    setNotifScheduled(true);
  }

  async function fetchSwell() {
    try {
      const r = await fetch('/api/swell');
      
      const data = await r.json();
      const hours = data.hours;
      const h0 = hours[0];
      setCurrent({ height: h0.swellHeight.sg, direction: h0.swellDirection.sg, period: h0.swellPeriod.sg });
      const days: {date:string, height:number, direction:number, period:number}[] = [];
      const seen = new Set<string>();
      for (const h of hours) {
        const date = h.time.slice(0, 10);
        const hour = parseInt(h.time.slice(11, 13));
        if (!seen.has(date) && hour >= 11 && hour <= 13) {
          seen.add(date);
          days.push({ date, height: h.swellHeight.sg, direction: h.swellDirection.sg, period: h.swellPeriod.sg });
        }
        if (days.length >= 5) break;
      }
      setForecast(days);
    } catch {
      setError('データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs() {
    try {
      const raw = await AsyncStorage.getItem('logs');
      if (raw) setLogs(JSON.parse(raw));
    } catch {}
  }

  async function addLog(shook: boolean) {
    if (!current) return;
    const today = new Date().toISOString().slice(0, 10);
    const entry: LogEntry = { date: today, ...current, shook };
    const updated = [entry, ...logs].slice(0, 30);
    setLogs(updated);
    await AsyncStorage.setItem('logs', JSON.stringify(updated));
    alert(shook ? '「揺れた」を記録しました' : '「揺れなかった」を記録しました');
  }

  if (loading) return <View style={styles.container}><ActivityIndicator size="large" /><Text style={styles.sub}>取得中...</Text></View>;
  if (error) return <View style={styles.container}><Text style={styles.error}>{error}</Text></View>;
  if (!current) return null;

  const risk = getRisk(current.height, current.direction, current.period);
  const riskColor = getRiskColor(risk);
  const riskLabel = risk === 'high' ? '避難推奨' : risk === 'mid' ? '注意' : '係留OK';
  const dirLabel = current.direction >= 150 && current.direction <= 220 ? '南系' : 'その他';
  const shookCount = logs.filter(l => l.shook).length;
  const totalCount = logs.length;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>係留番</Text>
      <Text style={styles.sub}>豊島沖 うねり情報</Text>

      {notifScheduled && (
        <View style={styles.notifBadge}>
          <Text style={styles.notifBadgeText}>毎日17:00に通知設定済み</Text>
        </View>
      )}

      <View style={[styles.riskCard, { borderColor: riskColor }]}>
        <Text style={[styles.riskLabel, { color: riskColor }]}>{riskLabel}</Text>
      </View>

      <View style={styles.dataCard}>
        <Text style={styles.dataRow}>波高　　{current.height.toFixed(2)} m</Text>
        <Text style={styles.dataRow}>波向き　{Math.round(current.direction)}°（{dirLabel}）</Text>
        <Text style={styles.dataRow}>周期　　{current.period.toFixed(1)} 秒</Text>
      </View>

      <Text style={styles.sectionTitle}>今日の記録</Text>
      <View style={styles.logBtnRow}>
        <TouchableOpacity style={[styles.logBtn, { borderColor: '#E24B4A' }]} onPress={() => addLog(true)}>
          <Text style={[styles.logBtnText, { color: '#E24B4A' }]}>揺れた</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.logBtn, { borderColor: '#639922' }]} onPress={() => addLog(false)}>
          <Text style={[styles.logBtnText, { color: '#639922' }]}>揺れなかった</Text>
        </TouchableOpacity>
      </View>

      {totalCount > 0 && (
        <View style={styles.statsCard}>
          <Text style={styles.statsText}>記録数: {totalCount}日　揺れた: {shookCount}日（{Math.round(shookCount / totalCount * 100)}%）</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>5日間予報</Text>
      <View style={styles.forecastRow}>
        {forecast.map((day, i) => {
          const r = getRisk(day.height, day.direction, day.period);
          const c = getRiskColor(r);
          return (
            <View key={day.date} style={[styles.dayCard, { borderColor: c }]}>
              <Text style={styles.dayLabel}>{getDayLabel(day.date, i)}</Text>
              <Text style={[styles.dayRisk, { color: c }]}>{getRiskLabel(r)}</Text>
              <Text style={styles.dayHeight}>{day.height.toFixed(1)}m</Text>
            </View>
          );
        })}
      </View>

      <TouchableOpacity onPress={() => setShowLog(!showLog)} style={styles.historyBtn}>
        <Text style={styles.historyBtnText}>{showLog ? '履歴を閉じる' : '過去の記録を見る'}</Text>
      </TouchableOpacity>

      {showLog && logs.map((l, i) => (
        <View key={i} style={[styles.historyRow, { borderLeftColor: l.shook ? '#E24B4A' : '#639922' }]}>
          <Text style={styles.historyDate}>{l.date}</Text>
          <Text style={[styles.historyResult, { color: l.shook ? '#E24B4A' : '#639922' }]}>{l.shook ? '揺れた' : '揺れなかった'}</Text>
          <Text style={styles.historyDetail}>{l.height.toFixed(2)}m / {Math.round(l.direction)}° / {l.period.toFixed(1)}秒</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f5f5f5', alignItems: 'center', padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  sub: { fontSize: 14, color: '#888', marginBottom: 32 },
  notifBadge: { backgroundColor: '#EEEDFE', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14, marginBottom: 16 },
  notifBadgeText: { fontSize: 12, color: '#3C3489' },
  riskCard: { borderWidth: 2, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 48, marginBottom: 24 },
  riskLabel: { fontSize: 24, fontWeight: 'bold' },
  dataCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '100%', marginBottom: 24 },
  dataRow: { fontSize: 16, marginBottom: 10, color: '#333' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#555', marginBottom: 12, alignSelf: 'flex-start' },
  logBtnRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 16 },
  logBtn: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#fff' },
  logBtnText: { fontSize: 16, fontWeight: 'bold' },
  statsCard: { backgroundColor: '#fff', borderRadius: 10, padding: 14, width: '100%', marginBottom: 24 },
  statsText: { fontSize: 13, color: '#555', textAlign: 'center' },
  forecastRow: { flexDirection: 'row', gap: 8, width: '100%', justifyContent: 'space-between', marginBottom: 24 },
  dayCard: { flex: 1, borderWidth: 1.5, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: '#fff' },
  dayLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  dayRisk: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  dayHeight: { fontSize: 11, color: '#aaa' },
  historyBtn: { marginBottom: 16 },
  historyBtnText: { fontSize: 14, color: '#888', textDecorationLine: 'underline' },
  historyRow: { backgroundColor: '#fff', borderRadius: 8, padding: 12, width: '100%', marginBottom: 8, borderLeftWidth: 3 },
  historyDate: { fontSize: 12, color: '#888', marginBottom: 2 },
  historyResult: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  historyDetail: { fontSize: 11, color: '#aaa' },
  error: { fontSize: 16, color: '#E24B4A' },
});