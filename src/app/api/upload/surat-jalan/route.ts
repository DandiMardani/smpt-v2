import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const transferId = formData.get("transfer_id") as string | null;
    const shipmentId = formData.get("shipment_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File foto tidak ditemukan." }, { status: 400 });
    }

    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const path = `surat-jalan/${shipmentId ? `shp_${shipmentId}` : `trf_${transferId || 'doc'}`}_${timestamp}_${cleanFileName}`;

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

    // If transfer_id provided, update transfer record
    if (transferId) {
      await supabase
        .from("finished_goods_transfers")
        .update({ surat_jalan_photo_url: photoUrl })
        .eq("id", transferId);
    }

    // If shipment_id provided, update shipment record
    if (shipmentId) {
      await supabase
        .from("embarkation_shipments")
        .update({ surat_jalan_photo_url: photoUrl })
        .eq("id", shipmentId);
    }

    return NextResponse.json({ success: true, photoUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Gagal mengunggah foto." }, { status: 500 });
  }
}
