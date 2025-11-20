const tableBody = document.getElementById('patient-table-body');
const rowTemplate = document.getElementById('row-template');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const closeButtons = [document.getElementById('modal-close'), document.getElementById('modal-close-footer')];
const reloadBtn = document.getElementById('reload-btn');

const hospitals = [
  'Seattle Grace Hospital',
  'St. Eligius Elsewhare',
  'Princeton Plainsboro House',
];

function showModal(message) {
  modalBody.textContent = message;
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('show');
}

function hideModal() {
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('show');
}

closeButtons.forEach((btn) => btn.addEventListener('click', hideModal));
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    hideModal();
  }
});

async function fetchPatients() {
  tableBody.innerHTML = '<tr><td colspan="5" class="empty">Loading patients...</td></tr>';
  try {
    const response = await fetch('get_patients.cgi', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    const data = await response.json();
    renderRows(data.patients || []);
  } catch (err) {
    console.error(err);
    renderRows(samplePatients());
  }
}

function renderRows(patients) {
  if (!patients.length) {
    tableBody.innerHTML = '<tr><td colspan="5" class="empty">No patients found.</td></tr>';
    return;
  }

  tableBody.innerHTML = '';

  patients.forEach((patient, index) => {
    const clone = rowTemplate.content.cloneNode(true);
    const row = clone.querySelector('tr');
    const nameCell = clone.querySelector('.patient-name');
    const mrnCell = clone.querySelector('.patient-mrn');
    const select = clone.querySelector('.hospital-select');
    const radios = clone.querySelectorAll('input[type="radio"]');
    const sendBtn = clone.querySelector('.send-btn');

    const idSuffix = patient.id || index + 1;
    radios.forEach((radio) => {
      radio.name = radio.name.replace('__ID__', idSuffix);
    });

    nameCell.textContent = `${patient.last_name}, ${patient.first_name}`;
    mrnCell.textContent = patient.mrn;

    sendBtn.addEventListener('click', async () => {
      const selectedHospital = select.value;
      const selectedAction = [...radios].find((r) => r.checked)?.value || 'A01';
      await sendRequest({ patientId: patient.id, hospital: selectedHospital, action: selectedAction });
    });

    tableBody.appendChild(clone);
  });
}

async function sendRequest(payload) {
  try {
    const params = new URLSearchParams({
      patient_id: String(payload.patientId || ''),
      hospital: payload.hospital,
      action: payload.action,
    });
    const response = await fetch('generate_hl7.cgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.status}`);
    }

    const text = await response.text();
    showModal(text);
  } catch (err) {
    console.error(err);
    showModal(`Generation failed. Showing sample message instead.\n\n${sampleHl7()}`);
  }
}

function samplePatients() {
  return [
    { id: 1, last_name: 'Smith', first_name: 'John', mrn: 'MRN00001' },
    { id: 2, last_name: 'Patel', first_name: 'Priya', mrn: 'MRN00002' },
    { id: 3, last_name: 'Chen', first_name: 'Alex', mrn: 'MRN00003' },
  ];
}

function sampleHl7() {
  return [
    'MSH|^~\\&|SPAAPP|Seattle Grace Hospital|HIS|Seattle Grace Hospital|202511201530||ADT^A01|MSG00001|P|2.5.1',
    'EVN|A01|202511201530',
    'PID|1||MRN00001||Smith^John^A||19800314|M|||123 Maple St^^New York^NY^10001',
    'PV1|1|I|ER^^^Seattle Grace Hospital|||||||||||||||||||',
  ].join('\n');
}

reloadBtn.addEventListener('click', fetchPatients);
fetchPatients();
