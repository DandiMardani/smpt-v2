import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const transferId = formData.get("transfer_id") as string | null;
    const packageTransferId = formData.get("package_transfer_id") as string | null;
    const shipmentId = formData.get("shipment_id") as string | null;

    // Pengecekan sesi user (Auth)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized. Silakan login terlebih dahulu." }, { status: 401 });
    }

    const targets = [transferId, packageTransferId, shipmentId].filter(Boolean);
    if (targets.length !== 1) {
      return NextResponse.json(
        { error: "Tentukan tepat satu target: transfer barang, transfer paket, atau pengiriman embarkasi." },
        { status: 400 }
      );
    }

    const targetId = transferId || packageTransferId || shipmentId;
    if (!targetId || !/^[1-9]\d*$/.test(targetId)) {
      return NextResponse.json({ error: "ID target tidak valid." }, { status: 400 });
    }

    const requiredPermission = shipmentId ? "pengiriman_embarkasi.operate" : "mr_wu.confirm";
    const { data: allowed, error: permissionError } = await supabase.rpc("has_permission", {
      p_permission: requiredPermission,
    });
    if (permissionError) {
      return NextResponse.json({ error: `Gagal memverifikasi izin: ${permissionError.message}` }, { status: 500 });
    }
    if (allowed !== true) {
      return NextResponse.json({ error: "Tidak memiliki izin mengunggah foto untuk target ini." }, { status: 403 });
    }

    if (!file) {
      return NextResponse.json({ error: "File foto tidak ditemukan." }, { status: 400 });
    }

    // Validasi whitelist MIME type dan ukuran maksimal 5MB
    const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Format file tidak didukung. Hanya file gambar JPG, PNG, atau WEBP yang diperbolehkan." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Ukuran file terlalu besar. Maksimal 5MB." },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const mimeToExt: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const ext = mimeToExt[file.type];
    const targetPrefix = shipmentId
      ? "shp"
      : packageTransferId
        ? "pkgtrf"
        : "trf";
    const path = `surat-jalan/${targetPrefix}_${targetId}_${timestamp}_${Math.random().toString(36).substring(7)}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("shipment-documents")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage
      .from("shipment-documents")
      .getPublicUrl(uploadData.path);

    const photoUrl = publicUrlData.publicUrl;

    const cleanupUpload = async () => {
      const { error } = await supabase.storage
        .from("shipment-documents")
        .remove([uploadData.path]);
      return error;
    };

    if (transferId) {
      const { error: updateErr } = await supabase.rpc("update_finished_good_transfer_photo", {
        p_transfer_id: transferId,
        p_photo_url: photoUrl,
      });

      if (updateErr) {
        const cleanupError = await cleanupUpload();
        return NextResponse.json({
          error: `Gagal memperbarui data transfer: ${updateErr.message}${cleanupError ? `; gagal membersihkan file unggahan: ${cleanupError.message}` : ""}`,
        }, { status: 500 });
      }

    }

    if (packageTransferId) {
      const { error: updateErr } = await supabase.rpc("update_bundle_package_transfer_photo", {
        p_transfer_id: packageTransferId,
        p_photo_url: photoUrl,
      });

      if (updateErr) {
        const cleanupError = await cleanupUpload();
        return NextResponse.json({
          error: `Gagal memperbarui foto transfer paket: ${updateErr.message}${cleanupError ? `; gagal membersihkan file unggahan: ${cleanupError.message}` : ""}`,
        }, { status: 500 });
      }
    }

    if (shipmentId) {
      const { error: updateErr } = await supabase.rpc("update_shipment_surat_jalan_photo", {
        p_shipment_id: shipmentId,
        p_photo_url: photoUrl,
      });

      if (updateErr) {
        const cleanupError = await cleanupUpload();
        return NextResponse.json({
          error: `Gagal memperbarui data pengiriman: ${updateErr.message}${cleanupError ? `; gagal membersihkan file unggahan: ${cleanupError.message}` : ""}`,
        }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, photoUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal mengunggah foto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
