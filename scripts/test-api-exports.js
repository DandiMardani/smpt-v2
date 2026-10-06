const fs = require('fs');

async function testExports() {
  const baseUrl = 'http://localhost:3000/api/export/xlsx';

  // We can fetch via http to see status code or test directly
  try {
    const res = await fetch(`${baseUrl}?report=operator_payroll_slips&price_type=operator&run_id=5`);
    console.log('Operator export status:', res.status, res.headers.get('content-disposition'));

    const res2 = await fetch(`${baseUrl}?report=operator_payroll_slips&price_type=pengajuan&run_id=5`);
    console.log('Pengajuan export status:', res2.status, res2.headers.get('content-disposition'));

    const res3 = await fetch(`${baseUrl}?report=operator_payroll_slips&run_id=5`);
    console.log('Complete export status:', res3.status, res3.headers.get('content-disposition'));
  } catch (err) {
    console.log('Fetch note:', err.message);
  }
}

testExports();
