import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { PARAMETER_OPTIONS, PlannerParams } from '../../data/beijingHomeUi';

type Key = keyof PlannerParams;
const LABELS: Record<Key, string> = { days: '行程日期', startDate: '', endDate: '', people: '出行人数', budget: '预计预算', pace: '旅行节奏' };

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.max(1, Math.round((db.getTime() - da.getTime()) / 86400000) + 1);
}

function dateOptions(year: number, month: number): string[] {
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => {
    const d = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    return d;
  });
}

export default function PlannerParameterPicker({
  field,
  value,
  onClose,
  onChange,
}: {
  field: Key | null;
  value: PlannerParams;
  onClose: () => void;
  onChange: (field: Key, value: string) => void;
}) {
  const [customBudget, setCustomBudget] = React.useState(value.budget.replace(/[^0-9]/g, ''));
  const [customPeople, setCustomPeople] = React.useState(value.people.replace(/[^0-9]/g, ''));
  React.useEffect(() => {
    if (field === 'budget' && value.budget !== '自定义') {
      setCustomBudget(value.budget.replace(/[^0-9]/g, ''));
    }
  }, [field, value.budget]);
  React.useEffect(() => {
    if (field === 'people' && value.people !== '自定义') {
      setCustomPeople(value.people.replace(/[^0-9]/g, ''));
    }
  }, [field, value.people]);

  const isDayField = field === 'days';

  return (
    <Modal visible={field !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />
          {field && !isDayField && (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>{LABELS[field]}</Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={22} color="#71827F" />
                </Pressable>
              </View>
              <View style={styles.options}>
                {PARAMETER_OPTIONS[field].map(option => {
                  const active = value[field] === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => {
                        if (option === '自定义') {
                          onChange(field, option);
                        } else {
                          onChange(field, option);
                          onClose();
                        }
                      }}
                      style={[styles.option, active && styles.optionActive]}
                    >
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>{option}</Text>
                      {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>
              {field === 'budget' && value.budget === '自定义' && (
                <View style={styles.customBox}>
                  <Text style={styles.customLabel}>输入本次预算（1000–50000）</Text>
                  <View style={styles.customRow}>
                    <Text style={styles.currency}>¥</Text>
                    <TextInput
                      value={customBudget}
                      onChangeText={text => setCustomBudget(text.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="例如 6500"
                      style={styles.customInput}
                    />
                    <Pressable
                      disabled={Number(customBudget) < 1000 || Number(customBudget) > 50000}
                      onPress={() => {
                        onChange('budget', `¥${customBudget}`);
                        onClose();
                      }}
                      style={[
                        styles.confirm,
                        (Number(customBudget) < 1000 || Number(customBudget) > 50000) && styles.confirmDisabled,
                      ]}
                    >
                      <Text style={styles.confirmText}>确认</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {field === 'people' && value.people === '自定义' && (
                <View style={styles.customBox}>
                  <Text style={styles.customLabel}>输入出行人数</Text>
                  <View style={styles.customRow}>
                    <TextInput
                      value={customPeople}
                      onChangeText={text => setCustomPeople(text.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="例如 6"
                      style={styles.customInput}
                    />
                    <Pressable
                      disabled={Number(customPeople) < 1 || Number(customPeople) > 50}
                      onPress={() => {
                        onChange('people', `${customPeople}人`);
                        onClose();
                      }}
                      style={[
                        styles.confirm,
                        (Number(customPeople) < 1 || Number(customPeople) > 50) && styles.confirmDisabled,
                      ]}
                    >
                      <Text style={styles.confirmText}>确认</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          )}

          {isDayField && (
            <DayRangePicker
              startDate={value.startDate}
              endDate={value.endDate}
              onConfirm={(start, end) => {
                const days = daysBetween(start, end);
                onChange('startDate', start);
                onChange('endDate', end);
                onChange('days', `${days}天`);
                onClose();
              }}
              onClose={onClose}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DayRangePicker({
  startDate,
  endDate,
  onConfirm,
  onClose,
}: {
  startDate: string;
  endDate: string;
  onConfirm: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [picking, setPicking] = React.useState<'start' | 'end'>('start');
  const [tempStart, setTempStart] = React.useState(startDate);
  const [tempEnd, setTempEnd] = React.useState(endDate);

  const dates = React.useMemo(() => dateOptions(year, month), [year, month]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const handlePick = (d: string) => {
    if (picking === 'start') {
      setTempStart(d);
      if (d > tempEnd) setTempEnd(d);
      setPicking('end');
    } else {
      if (d < tempStart) {
        setTempStart(d);
        setTempEnd(tempStart);
      } else {
        setTempEnd(d);
      }
    }
  };

  const totalDays = daysBetween(tempStart, tempEnd);

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>行程日期</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color="#71827F" />
        </Pressable>
      </View>

      {/* 当前选择状态 */}
      <View style={styles.pickHint}>
        <Text style={styles.pickHintText}>
          {picking === 'start'
            ? `请选择出发日期`
            : `请选择返回日期`}
        </Text>
        <View style={styles.pickSummary}>
          <View style={[styles.pickDot, styles.pickDotStart]} />
          <Text style={styles.pickSummaryText}>{formatDateLabel(tempStart)}</Text>
          <Text style={styles.pickArrow}>→</Text>
          <View style={[styles.pickDot, styles.pickDotEnd]} />
          <Text style={styles.pickSummaryText}>{formatDateLabel(tempEnd)}</Text>
          <Text style={styles.pickDays}>共{totalDays}天</Text>
        </View>
      </View>

      {/* 月份导航 */}
      <View style={styles.monthNav}>
        <Pressable onPress={prevMonth} style={styles.monthBtn}><Ionicons name="chevron-back" size={16} color="#0F2B27" /></Pressable>
        <Text style={styles.monthTitle}>{year}年{month}月</Text>
        <Pressable onPress={nextMonth} style={styles.monthBtn}><Ionicons name="chevron-forward" size={16} color="#0F2B27" /></Pressable>
      </View>

      {/* 日期网格 */}
      <View style={styles.dateGrid}>
        {['日', '一', '二', '三', '四', '五', '六'].map(d => (
          <Text key={d} style={styles.weekDay}>{d}</Text>
        ))}
        {(() => {
          const firstDay = new Date(year, month - 1, 1).getDay();
          const blanks = Array.from({ length: firstDay }, (_, i) => i);
          return blanks.map(i => <View key={`b${i}`} style={styles.dateCell} />);
        })()}
        {dates.map(d => {
          const isStart = d === tempStart;
          const isEnd = d === tempEnd;
          const isInRange = d > tempStart && d < tempEnd;
          const dayNum = new Date(`${d}T12:00:00`).getDate();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const isToday = d === todayStr;
          const isPast = d < todayStr;
          return (
            <Pressable
              key={d}
              style={[
                styles.dateCell,
                isStart && styles.dateCellStart,
                isEnd && styles.dateCellEnd,
                isInRange && styles.dateCellRange,
              ]}
              onPress={isPast ? undefined : () => handlePick(d)}
              disabled={isPast}
            >
              <Text style={[
                styles.dateText,
                isPast && styles.datePast,
                isToday && styles.dateToday,
                (isStart || isEnd) && styles.dateSelected,
              ]}>{dayNum}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.confirmBtn} onPress={() => onConfirm(tempStart, tempEnd)}>
        <Text style={styles.confirmBtnText}>确认 · 共{totalDays}天</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(7,35,31,0.38)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: '#CBD8D4', marginBottom: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#0F2B27', fontSize: 18, fontWeight: '800' },
  options: { gap: 9, marginTop: 18 },
  option: {
    minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: '#E3EBE8',
    paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  optionActive: { borderColor: colors.primary, backgroundColor: '#F1FBF9' },
  optionText: { color: '#304641', fontSize: 14, fontWeight: '600' },
  optionTextActive: { color: colors.primaryDark, fontWeight: '800' },
  customBox: { marginTop: 14, padding: 12, borderRadius: 15, backgroundColor: '#F4FAF7' },
  customLabel: { color: '#617571', fontSize: 11, fontWeight: '700' },
  customRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  currency: { color: colors.primaryDark, fontSize: 18, fontWeight: '900' },
  customInput: { flex: 1, height: 43, marginHorizontal: 7, paddingHorizontal: 10, borderRadius: 11, backgroundColor: '#FFF', color: '#0F2B27', fontSize: 16 },
  confirm: { minHeight: 43, paddingHorizontal: 14, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  confirmDisabled: { opacity: 0.4 },
  confirmText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  // 日期选择器
  pickHint: { marginTop: 12 },
  pickHintText: { color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  pickSummary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F4F7F6' },
  pickDot: { width: 8, height: 8, borderRadius: 4 },
  pickDotStart: { backgroundColor: colors.primary },
  pickDotEnd: { backgroundColor: '#C9853E' },
  pickSummaryText: { color: '#304641', fontSize: 12, fontWeight: '600' },
  pickArrow: { color: '#A0B0AD', fontSize: 12 },
  pickDays: { color: colors.primary, fontSize: 11, fontWeight: '800', marginLeft: 4 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 },
  monthBtn: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F7F6' },
  monthTitle: { color: '#0F2B27', fontSize: 14, fontWeight: '800' },
  dateGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekDay: { width: '14.28%', textAlign: 'center', color: '#A0B0AD', fontSize: 10, fontWeight: '700', paddingVertical: 8 },
  dateCell: { width: '14.28%', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  dateCellStart: { backgroundColor: colors.primary, borderRadius: 10 },
  dateCellEnd: { backgroundColor: '#C9853E', borderRadius: 10 },
  dateCellRange: { backgroundColor: '#E6F8F4' },
  dateText: { color: '#304641', fontSize: 13, fontWeight: '600' },
  datePast: { color: '#D0D8D5' },
  dateToday: { color: colors.primary, fontWeight: '900' },
  dateSelected: { color: '#FFF', fontWeight: '900' },
  confirmBtn: { marginTop: 14, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: colors.primary },
  confirmBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});