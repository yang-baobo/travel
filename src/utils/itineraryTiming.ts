const toMinutes = (clock: string) => clock.split(':').reduce((hours, minutes) => hours * 60 + Number(minutes), 0);
const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Provider travel duration and solver waiting slack are different things. */
export function itineraryLegTiming(endTime: string, nextStart: string, duration: number | null, restMinutes = 0) {
  const departure = toMinutes(endTime) + restMinutes;
  const arrival = duration === null ? null : departure + duration;
  return {
    departAt: toClock(departure),
    arriveAt: arrival === null ? '待核实' : toClock(arrival),
    waitMinutes: arrival === null ? 0 : Math.max(0, toMinutes(nextStart) - arrival),
  };
}
