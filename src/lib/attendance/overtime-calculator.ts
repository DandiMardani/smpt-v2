export type ShiftOvertimeResult = {
  dayOfWeek: number; // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  dayName: string;
  isSunday: boolean;
  isSaturday: boolean;
  isWeekday: boolean;
  standardIn: string;
  standardOut: string;
  overtimeMinutes: number;
  overtimeHours: number;
  qualifies4hBonus: boolean;
  bonus4hAmount: number;
  sundayBonusAmount: number;
  sundayMealAmount: number;
  fridayOvertimeNextWeek: boolean;
  description: string;
};

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/**
 * Mengonversi string waktu "HH:mm" atau "HH:mm:ss" ke jumlah menit dari 00:00
 */
export function timeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Format menit ke teks jam yang mudah dibaca (misal 150 menit -> "2 jam 30 mnt")
 */
export function formatMinutesToHours(minutes: number): string {
  if (minutes <= 0) return "0 jam";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} mnt`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} mnt`;
}

/**
 * Kalkulator Lembur Resmi Sesuai Ketentuan:
 * - Senin - Jumat: 08:00 - 17:00 (Lembur jika pulang > 17:00 dan minimal >= 30 menit)
 * - Sabtu: 08:00 - 15:00 (Lembur jika pulang > 15:00 dan minimal >= 30 menit)
 * - Minggu: 08:00 - 17:00 (Hari Libur Masuk)
 *
 * Kompensasi & Tambahan Dinamis:
 * - Harian:
 *   * Lembur / jam = Gaji Harian / 8
 *   * Hadir Minggu = Tambahan Rp 20.000
 *   * Lembur lewat 17:00 minimal 4 jam (pulang >= 21:00) = Tambahan Rp 5.000
 * - Bulanan:
 *   * Lembur / jam = Gaji Bulanan / 190
 *   * Masuk Minggu = Lembur standar 8 jam + Uang Makan Rp 50.000
 *   * Lembur lewat 17:00 minimal 4 jam (pulang >= 21:00) = Tambahan Rp 17.500
 */
export function calculateShiftOvertime(
  attendanceDate: string,
  actualIn?: string | null,
  actualOut?: string | null,
  paySystem: string = "HARIAN",
  manualOvertimeMinutes?: number | null,
  shiftSettings?: Record<string, any>
): ShiftOvertimeResult {
  const isBulanan = String(paySystem).toUpperCase() === "BULANAN";

  // Parse date tanpa pergeseran timezone
  const parts = String(attendanceDate).slice(0, 10).split("-");
  const year = parseInt(parts[0], 10) || 2026;
  const month = (parseInt(parts[1], 10) || 1) - 1;
  const day = parseInt(parts[2], 10) || 1;
  const d = new Date(year, month, day);
  const dow = d.getDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu

  const isSunday = dow === 0;
  const isSaturday = dow === 6;
  const isFriday = dow === 5;
  const isWeekday = dow >= 1 && dow <= 5;
  const dayName = DAY_NAMES[dow] || "Hari";

  // Batas minimal lembur dihitung (default: 30 menit. Jika di bawah 30 mnt = 0)
  const minOtThreshold = Number(shiftSettings?.OT_MIN_THRESHOLD_MINUTES ?? 30);

  // Jadwal jam kerja normal shift
  let standardIn = (shiftSettings?.SHIFT_WEEKDAY_IN as string) || "08:00";
  let standardOut = (shiftSettings?.SHIFT_WEEKDAY_OUT as string) || "17:00";
  let standardOutMinutes = timeToMinutes(standardOut) ?? (17 * 60);

  if (isSaturday) {
    standardOut = (shiftSettings?.SHIFT_SATURDAY_OUT as string) || "15:00";
    standardOutMinutes = timeToMinutes(standardOut) ?? (15 * 60);
  } else if (isSunday) {
    standardIn = (shiftSettings?.SHIFT_SUNDAY_IN as string) || "08:00";
    standardOut = (shiftSettings?.SHIFT_SUNDAY_OUT as string) || "17:00";
    standardOutMinutes = timeToMinutes(standardOut) ?? (17 * 60);
  }

  const bonus4hDefault = isBulanan
    ? Number(shiftSettings?.OT_BONUS_BULANAN_4H ?? 17500)
    : Number(shiftSettings?.OT_BONUS_HARIAN_4H ?? 5000);
  const sundayBonusDefault = isSunday && !isBulanan
    ? Number(shiftSettings?.HARIAN_HOLIDAY_BONUS_FULL ?? 20000)
    : 0;
  const sundayMealDefault = isSunday && isBulanan
    ? Number(shiftSettings?.BULANAN_SUNDAY_MEAL ?? 50000)
    : 0;

  // Jika admin menginput menit lembur manual secara eksplisit
  if (typeof manualOvertimeMinutes === "number" && manualOvertimeMinutes > 0) {
    const otMin = Math.round(manualOvertimeMinutes);
    const otHours = Math.round((otMin / 60) * 10) / 10;
    const qualifies4h = isSunday
      ? (isBulanan ? otMin >= 720 : otMin >= 240)
      : otMin >= 240;
    const bonus4h = qualifies4h ? bonus4hDefault : 0;
    const sundayBonus = sundayBonusDefault;
    const sundayMeal = sundayMealDefault;

    return {
      dayOfWeek: dow,
      dayName,
      isSunday,
      isSaturday,
      isWeekday,
      standardIn,
      standardOut,
      overtimeMinutes: otMin,
      overtimeHours: otHours,
      qualifies4hBonus: qualifies4h,
      bonus4hAmount: bonus4h,
      sundayBonusAmount: sundayBonus,
      sundayMealAmount: sundayMeal,
      fridayOvertimeNextWeek: isFriday && otMin > 0,
      description: isSunday
        ? (isBulanan
            ? `Hari Minggu: ${formatMinutesToHours(otMin)} lembur + Uang Makan Rp 50.000${qualifies4h ? " + Tambahan Rp 17.500" : ""}`
            : `Hari Minggu: ${formatMinutesToHours(otMin)} lembur lewat 17:00 + Tambahan Rp 20.000${qualifies4h ? " + Tambahan Rp 5.000" : ""}`)
        : `Lembur manual: ${formatMinutesToHours(otMin)}${qualifies4h ? (isBulanan ? " + Tambahan Rp 17.500" : " + Tambahan Rp 5.000") : ""}`,
    };
  }

  const outMin = timeToMinutes(actualOut);
  let calculatedOtMinutes = 0;
  let description = "";

  if (isSunday) {
    if (isBulanan) {
      // BULANAN: Hari Minggu 08:00 - 17:00 adalah 8 jam lembur (480 mnt) + Uang Makan Rp 50.000
      let otPast17 = 0;
      if (outMin !== null && outMin > standardOutMinutes) {
        const rawDiff = outMin - standardOutMinutes;
        otPast17 = rawDiff >= minOtThreshold ? rawDiff : 0;
      }
      calculatedOtMinutes = 480 + otPast17;
      const qualifies4h = otPast17 >= 240; // Lembur lewat jam 17:00 minimal 4 jam (pulang >= 21:00)
      const bonus4h = qualifies4h ? bonus4hDefault : 0;

      return {
        dayOfWeek: dow,
        dayName,
        isSunday,
        isSaturday,
        isWeekday,
        standardIn,
        standardOut,
        overtimeMinutes: calculatedOtMinutes,
        overtimeHours: Math.round((calculatedOtMinutes / 60) * 10) / 10,
        qualifies4hBonus: qualifies4h,
        bonus4hAmount: bonus4h,
        sundayBonusAmount: 0,
        sundayMealAmount: sundayMealDefault,
        fridayOvertimeNextWeek: false,
        description: otPast17 > 0
          ? `Minggu lembur 8 jam + lewat 17:00 (${formatMinutesToHours(otPast17)}) + Makan Minggu Rp 50rb${qualifies4h ? " + Tambahan Rp 17.500" : ""}`
          : "Hari Minggu: lembur standar 8 jam + Uang Makan Minggu Rp 50.000",
      };
    } else {
      // HARIAN: Masuk 08:00 - 17:00 dapat Tambahan Rp 20.000
      // Lembur baru dihitung jika lewat 17:00 dan memenuhi threshold (>= 30 menit)
      if (outMin !== null && outMin > standardOutMinutes) {
        const rawDiff = outMin - standardOutMinutes;
        calculatedOtMinutes = rawDiff >= minOtThreshold ? rawDiff : 0;
        const qualifies4h = calculatedOtMinutes >= 240;
        const bonus4h = qualifies4h ? bonus4hDefault : 0;
        return {
          dayOfWeek: dow,
          dayName,
          isSunday,
          isSaturday,
          isWeekday,
          standardIn,
          standardOut,
          overtimeMinutes: calculatedOtMinutes,
          overtimeHours: Math.round((calculatedOtMinutes / 60) * 10) / 10,
          qualifies4hBonus: qualifies4h,
          bonus4hAmount: bonus4h,
          sundayBonusAmount: sundayBonusDefault,
          sundayMealAmount: 0,
          fridayOvertimeNextWeek: false,
          description: calculatedOtMinutes > 0
            ? `Minggu masuk (08:00-17:00) + lembur lewat 17:00 ${formatMinutesToHours(calculatedOtMinutes)} + Tambahan Rp 20.000${qualifies4h ? " + Tambahan Rp 5.000" : ""}`
            : "Hari Minggu: shift standar (08:00 - 17:00) + Tambahan Minggu Rp 20.000 (lembur < 30 mnt diabaikan)",
        };
      } else {
        return {
          dayOfWeek: dow,
          dayName,
          isSunday,
          isSaturday,
          isWeekday,
          standardIn,
          standardOut,
          overtimeMinutes: 0,
          overtimeHours: 0,
          qualifies4hBonus: false,
          bonus4hAmount: 0,
          sundayBonusAmount: sundayBonusDefault,
          sundayMealAmount: 0,
          fridayOvertimeNextWeek: false,
          description: "Hari Minggu: shift standar (08:00 - 17:00) + Tambahan Minggu Rp 20.000",
        };
      }
    }
  } else if (isSaturday) {
    // Sabtu: Pulang normal 15:00
    if (outMin !== null && outMin > standardOutMinutes) {
      const rawDiff = outMin - standardOutMinutes;
      calculatedOtMinutes = rawDiff >= minOtThreshold ? rawDiff : 0;
      description = calculatedOtMinutes > 0
        ? `Sabtu lembur lewat 15:00: ${formatMinutesToHours(calculatedOtMinutes)}`
        : "Sabtu: pulang lewat jam 15:00 kurang dari 30 menit (lembur 0)";
    } else {
      calculatedOtMinutes = 0;
      description = "Sabtu jam normal (08:00 - 15:00), tidak ada lembur";
    }
  } else {
    // Senin - Jumat: Pulang normal 17:00
    if (outMin !== null && outMin > standardOutMinutes) {
      const rawDiff = outMin - standardOutMinutes;
      calculatedOtMinutes = rawDiff >= minOtThreshold ? rawDiff : 0;
      description = calculatedOtMinutes > 0
        ? `${dayName} lembur lewat 17:00: ${formatMinutesToHours(calculatedOtMinutes)}`
        : `${dayName}: pulang lewat 17:00 kurang dari 30 menit (lembur 0)`;
    } else {
      calculatedOtMinutes = 0;
      description = `${dayName} jam normal (08:00 - 17:00), tidak ada lembur`;
    }
  }

  const otHours = Math.round((calculatedOtMinutes / 60) * 10) / 10;
  const qualifies4h = calculatedOtMinutes >= 240;
  const bonus4h = qualifies4h ? bonus4hDefault : 0;
  const sundayBonus = sundayBonusDefault;
  const sundayMeal = sundayMealDefault;
  const fridayOvertimeNextWeek = isFriday && calculatedOtMinutes > 0;

  return {
    dayOfWeek: dow,
    dayName,
    isSunday,
    isSaturday,
    isWeekday,
    standardIn,
    standardOut,
    overtimeMinutes: calculatedOtMinutes,
    overtimeHours: otHours,
    qualifies4hBonus: qualifies4h,
    bonus4hAmount: bonus4h,
    sundayBonusAmount: sundayBonus,
    sundayMealAmount: sundayMeal,
    fridayOvertimeNextWeek,
    description: qualifies4h
      ? `${description} + Tambahan ${isBulanan ? "Rp 17.500" : "Rp 5.000"}`
      : description,
  };
}
