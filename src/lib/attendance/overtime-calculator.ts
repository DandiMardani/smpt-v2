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
  manualOvertimeMinutes?: number | null,
  shiftSettings?: Record<string, any>
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

  // Tentukan jam kerja normal shift (dapat dikonfigurasi via payroll_settings)
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

  // Jika admin menginput menit lembur manual secara eksplisit (> 0)
  if (typeof manualOvertimeMinutes === "number" && manualOvertimeMinutes > 0) {
    const otMin = Math.round(manualOvertimeMinutes);
    const otHours = Math.round((otMin / 60) * 10) / 10;
    // Bonus 4 jam (uang makan lembur Rp 17.500 / Rp 5.000)
    // Hari Biasa: otMin >= 240
    // Hari Minggu:
    // - Harian: otMin >= 240 (karena lembur hanya dihitung lewat jam 17:00)
    // - Bulanan: otMin >= 720 (480 min lembur standar Minggu + 240 min lembur lewat jam 17:00)
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
            ? `Hari Minggu: ${formatMinutesToHours(otMin)} lembur + Uang Makan Rp 50.000${qualifies4h ? " + Uang Makan Lembur Rp 17.500" : ""}`
            : `Hari Minggu: ${formatMinutesToHours(otMin)} lembur lewat 17:00 + Insentif Rp 20.000${qualifies4h ? " + Bonus Lembur Rp 5.000" : ""}`)
        : `Lembur manual: ${formatMinutesToHours(otMin)}${qualifies4h ? (isBulanan ? " + Uang Makan Lembur Rp 17.500" : " + Bonus Rp 5.000") : ""}`,
    };
  }

  const inMin = timeToMinutes(actualIn);
  const outMin = timeToMinutes(actualOut);

  let calculatedOtMinutes = 0;
  let description = "";

  if (isSunday) {
    if (isBulanan) {
      // BULANAN: Hari Minggu 08:00 - 17:00 adalah 8 jam lembur (480 mnt) + Uang Makan Minggu Rp 50.000
      // Jika kerja lewat 17:00, jam lembur bertambah
      const otPast17 = (outMin !== null && outMin > standardOutMinutes) ? (outMin - standardOutMinutes) : 0;
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
          ? `Minggu lembur 8 jam + lewat 17:00 (${formatMinutesToHours(otPast17)}) + Makan Minggu Rp 50rb${qualifies4h ? " + Makan Lembur Rp 17.500" : ""}`
          : "Hari Minggu: lembur standar 8 jam + Uang Makan Minggu Rp 50.000",
      };
    } else {
      // HARIAN: Hari Minggu jam 08:00 s/d 17:00 HANYA TAMBAHAN Rp 20.000 (jam kerja shift reguler Minggu)
      // Lembur BARU BERLAKU kalau lewat dari jam 17:00
      // Dan kalau lembur lewat jam 17:00 minimal 4 jam (pulang >= 21:00), baru dapat tambahan Rp 5.000
      if (outMin !== null && outMin > standardOutMinutes) {
        calculatedOtMinutes = outMin - standardOutMinutes;
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
          description: `Minggu masuk (08:00-17:00) + lembur lewat 17:00 ${formatMinutesToHours(calculatedOtMinutes)} + Insentif Rp 20.000${qualifies4h ? " + Bonus Rp 5.000" : ""}`,
        };
      } else {
        // Pulang jam 17:00 atau sebelumnya: 0 menit lembur, HANYA tambahan Rp 20.000
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
          description: "Hari Minggu: shift standar (08:00 - 17:00) + Insentif Minggu Rp 20.000",
        };
      }
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
      ? `${description} + ${isBulanan ? "Uang Makan Lembur Rp 17.500" : "Bonus Rp 5.000"}`
      : description,
  };
}
