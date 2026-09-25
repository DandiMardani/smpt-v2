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
 * Kalkulator Lembur Resmi Sesuai Ketentuan Pabrik:
 * - Senin - Jumat: 08:00 - 17:00 (Lembur jika pulang > 17:00)
 * - Sabtu: 08:00 - 15:00 (Lembur jika pulang > 15:00)
 * - Minggu: 08:00 - 17:00 (Hari Lembur Penuh / Libur Masuk)
 * 
 * Insentif & Bonus:
 * - Harian:
 *   * Lembur / jam = Gaji Harian / 8
 *   * Lembur >= 4 jam = Tambahan Rp 5.000
 *   * Hadir Minggu = Tambahan Rp 20.000
 *   * Lembur Jumat malam (>17:00) di-carry forward ke periode minggu depan
 * - Bulanan:
 *   * Lembur / jam = Gaji Bulanan / 190
 *   * Lembur >= 4 jam = Tambahan Rp 17.500
 *   * Masuk/Lembur Minggu = 8 jam lembur + Uang Makan Rp 50.000 (+ Bonus 4H jika >= 4 jam)
 */
export function calculateShiftOvertime(
  attendanceDate: string,
  actualIn?: string | null,
  actualOut?: string | null,
  paySystem: string = "HARIAN",
  manualOvertimeMinutes?: number | null
): ShiftOvertimeResult {
  const isBulanan = String(paySystem).toUpperCase() === "BULANAN";

  // Parse date without timezone shifts
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

  // Tentukan jam kerja normal shift
  let standardIn = "08:00";
  let standardOut = "17:00";
  let standardOutMinutes = 17 * 60; // 1020

  if (isSaturday) {
    standardOut = "15:00";
    standardOutMinutes = 15 * 60; // 900
  } else if (isSunday) {
    standardIn = "08:00";
    standardOut = "17:00";
    standardOutMinutes = 17 * 60;
  }

  // Jika admin menginput menit lembur manual secara eksplisit (> 0)
  if (typeof manualOvertimeMinutes === "number" && manualOvertimeMinutes > 0) {
    const otMin = Math.round(manualOvertimeMinutes);
    const otHours = Math.round((otMin / 60) * 10) / 10;
    const qualifies4h = otMin >= 240;
    const bonus4h = qualifies4h ? (isBulanan ? 17500 : 5000) : 0;
    const sundayBonus = isSunday && !isBulanan ? 20000 : 0;
    const sundayMeal = isSunday && isBulanan ? 50000 : 0;

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
      description: `Lembur manual: ${formatMinutesToHours(otMin)}`,
    };
  }

  const inMin = timeToMinutes(actualIn);
  const outMin = timeToMinutes(actualOut);

  let calculatedOtMinutes = 0;
  let description = "";

  if (isSunday) {
    // Hari Minggu: Hari Lembur / Masuk Minggu
    if (outMin !== null && inMin !== null && outMin > inMin) {
      const rawSpan = outMin - inMin;
      // Potong istirahat 60 menit jika kerja >= 5 jam (300 menit)
      const effective = rawSpan >= 300 ? rawSpan - 60 : rawSpan;
      calculatedOtMinutes = Math.max(0, effective);
      description = `Hari Minggu masuk: ${formatMinutesToHours(calculatedOtMinutes)} kerja`;
    } else {
      // Default jika scan tidak lengkap atau masuk standar 08-17
      calculatedOtMinutes = 8 * 60; // 480 menit
      description = "Hari Minggu lembur standar 8 jam (08:00 - 17:00)";
    }
  } else if (isSaturday) {
    // Hari Sabtu: Pulang normal 15:00
    if (outMin !== null && outMin > standardOutMinutes) {
      calculatedOtMinutes = outMin - standardOutMinutes;
      description = `Sabtu lembur lewat 15:00: ${formatMinutesToHours(calculatedOtMinutes)}`;
    } else {
      calculatedOtMinutes = 0;
      description = "Sabtu jam normal (08:00 - 15:00), tidak ada lembur";
    }
  } else {
    // Senin - Jumat: Pulang normal 17:00
    if (outMin !== null && outMin > standardOutMinutes) {
      calculatedOtMinutes = outMin - standardOutMinutes;
      description = `${dayName} lembur lewat 17:00: ${formatMinutesToHours(calculatedOtMinutes)}`;
    } else {
      calculatedOtMinutes = 0;
      description = `${dayName} jam normal (08:00 - 17:00), tidak ada lembur`;
    }
  }

  const otHours = Math.round((calculatedOtMinutes / 60) * 10) / 10;
  const qualifies4h = calculatedOtMinutes >= 240;
  const bonus4h = qualifies4h ? (isBulanan ? 17500 : 5000) : 0;
  const sundayBonus = isSunday && !isBulanan ? 20000 : 0;
  const sundayMeal = isSunday && isBulanan ? 50000 : 0;
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
    description,
  };
}
