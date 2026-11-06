# Review Penggunaan DDT pada payrollv2-app

## Ringkasan

DDT memberi nilai nyata pada correctness dan orientasi lintas repository, tetapi
penggunaan pertama pada `payrollv2-app` lebih mahal secara token daripada workflow
langsung. Penyebab utamanya bukan progressive retrieval, melainkan instalasi skill
aktif yang terpisah dari shared bundle, fallback manual, dan knowledge yang belum
melewati writer resmi.

Setelah hardening, ekspektasi yang masuk akal adalah:

- task sederhana satu kali: sedikit lebih mahal;
- task domain yang berulang: berpotensi lebih murah;
- task lintas repo atau berisiko tinggi: lebih mahal di awal, tetapi membeli
  correctness, provenance, dan reuse;
- cold start tanpa knowledge: tetap lebih mahal daripada pencarian code langsung.

Belum ada controlled A/B test dengan model, prompt, dan task identik. Karena itu
kesimpulan biaya di atas bersifat observational, bukan benchmark kausal.

## Experience aktual

Yang efektif:

- Graph lalu Product Knowledge memberi arah pencarian yang cepat.
- Knowledge backend mengungkap kontrak non-intuitif: UI memakai `EMPLOYEE_ID`,
  filter backend bernama `EMPLOYEE_NO`, tetapi nilainya `empId`; output transaksi
  baru menggunakan `empNo`.
- Pemisahan Orchestrator dan domain executor membantu menjaga ownership.
- Progressive loading mendorong pembacaan node yang relevan, bukan seluruh repo.

Yang mengganggu:

- Skill aktif berada di `.codex/skills`, tetapi attachment/helper berada di
  `~/plugins/dev-dream-team`; relative path gagal.
- Kegagalan helper mendorong manual JSON yang ternyata memakai schema version
  yang tidak didukung writer.
- Dirty working-tree behavior diberi `last_verified_sha=HEAD`, walaupun HEAD tidak
  mengandung behavior tersebut.
- Legacy knowledge diringkas dan diberi SHA baru tanpa verifikasi setiap claim.
- External backend contract hanya ditulis sebagai evidence string, bukan graph
  boundary yang navigable.
- Active routes yang tidak terpetakan tidak terlihat sebagai coverage gap.

## Efektivitas

Efektivitas sebelum hardening: mixed. Domain grounding membantu implementasi,
tetapi trust terhadap overlay terlalu tinggi dan validator tidak benar-benar
dipakai. Knowledge mempercepat pencarian sekaligus menciptakan risiko false
confidence.

Efektivitas setelah hardening: lebih defensible, karena:

- bundle resolver menemukan canonical attachment/helper dari active skill path;
- helper membedakan `dirty-task-local` dan `stale`;
- writer menolak commit provenance yang tidak mengandung cited paths;
- linked knowledge/playbook divalidasi;
- legacy claims tetap legacy sampai diverifikasi;
- cross-repo contract diwajibkan memakai external node/reference;
- route/registry coverage gap harus dilaporkan terpisah.

## Token economics

| Skill | Before words | After words | Delta |
|---|---:|---:|---:|
| project-orchestrator | 891 | 1008 | +117 |
| product-knowledge | 845 | 968 | +123 |
| update-repository-context | 381 | 493 | +112 |

Total tambahan bila ketiganya dimuat adalah 352 kata. Jalur implementasi normal
tidak selalu memuat ketiganya; updater hanya dibutuhkan untuk durable writes.

Pada overlay payroll saat ini, seluruh overlay berisi 15 file dan 19,120 bytes.
Index + journal node + journal knowledge hanya 3 file dan 6,921 bytes, atau 36.2%.
Pada graph lebih besar persentasenya seharusnya turun, tetapi itu belum diukur.

Pada sesi ini total token jelas lebih mahal karena full overlay sempat dibaca,
output pencarian terlalu luas, dan knowledge harus direview ulang. Hardening
mengurangi kemungkinan biaya korektif tersebut, tetapi belum membuktikan
penghematan total pada model run berikutnya.

## Trade-offs

- Tambahan instruksi kecil versus pencegahan fallback manual yang mahal.
- Writer lebih ketat dapat menunda promotion, tetapi task-local observations tetap
  bisa dipakai untuk pekerjaan aktif.
- Coverage audit menambah discovery pada cold start, tetapi tidak perlu dijalankan
  ulang untuk node yang fresh dan tidak terdampak.
- DDT paling bernilai untuk repositori yang sering disentuh; untuk typo lokal,
  fast path harus tetap dominan.

## Pertanyaan untuk reviewer lain

1. Apakah trust states yang dipilih cukup?
2. Apakah writer terlalu ketat ketika satu cited path dirty?
3. Apakah instruction delta 352 kata sepadan dengan failure modes yang dicegah?
4. Bagaimana controlled A/B test untuk cumulative token cost dan correctness?
5. Apakah route coverage perlu adapter deterministic per framework?

## Prompt siap dikirim

```text
Review desain dan pengalaman penggunaan Dev Dream Team (DDT) berikut sebagai
reviewer independen. Fokus pada correctness, cumulative token cost, ketatnya
provenance/writer rules, risiko false confidence, dan rancangan A/B test. Jangan
menerima klaim penghematan token tanpa evidence.

Evidence:
- Knowledge mempercepat penemuan kontrak payroll lintas FE/BE yang non-intuitif.
- First run lebih mahal karena bundle resolution gagal, manual JSON dibuat,
  seluruh overlay sempat dibaca, dan knowledge harus direview ulang.
- Hardening menambah 352 kata jika tiga skill terkait semuanya dimuat.
- Selective read pada overlay kecil membaca 6,921 dari 19,120 bytes (36.2%).
- Resolver, provenance rejection, dirty-task-local state, dan broken-link checks
  sekarang diuji secara deterministik.
- Belum ada controlled model A/B test; verdict biaya masih observational.

Berikan findings berdasarkan severity, lalu verdict untuk simple one-off task,
repeated domain task, dan high-risk cross-repo task. Akhiri dengan eksperimen
minimum untuk membuktikan atau menolak klaim token efficiency.
```
