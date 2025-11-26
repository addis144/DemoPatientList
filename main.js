const tableBody = document.getElementById('patient-table-body');
const rowTemplate = document.getElementById('row-template');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const modalStatus = document.getElementById('modal-status');
const confirmSendBtn = document.getElementById('confirm-send');
const closeButtons = [document.getElementById('modal-close'), document.getElementById('modal-close-footer')];
const reloadBtn = document.getElementById('reload-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const facilityTableBody = document.getElementById('facility-table-body');
const addFacilityBtn = document.getElementById('add-facility');
const resetFacilityBtn = document.getElementById('reset-facility');
const saveFacilityBtn = document.getElementById('save-facility');
const facilityStatus = document.getElementById('facility-status');

const defaultFacilities = [
  { name: 'Seattle Grace Hospital', code: 'SGH', sendingId: 'SPAAPP' },
  { name: 'St. Eligius Elsewhare', code: 'SEL', sendingId: 'SPAAPP' },
  { name: 'Princeton Plainsboro House', code: 'PPH', sendingId: 'SPAAPP' },
];

let facilities = defaultFacilities.map((facility) => ({ ...facility }));
let latestPreview = null;

function switchTab(tabName) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.id === `${tabName}-tab`;
    panel.classList.toggle('active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
}

tabButtons.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

function setModalStatus(message, type = 'info') {
  if (!modalStatus) return;
  modalStatus.textContent = message || '';
  modalStatus.classList.remove('status-success', 'status-error', 'status-info');
  if (message) {
    modalStatus.classList.add(`status-${type}`);
  }
}

function showModal(message, meta = {}) {
  modalBody.textContent = message;
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('show');
  latestPreview = { ...meta, hl7_message: message };
  if (confirmSendBtn) {
    confirmSendBtn.disabled = false;
  }
  setModalStatus('');
}

function hideModal() {
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('show');
  latestPreview = null;
  setModalStatus('');
}

function setFacilityStatus(message, type = 'info') {
  if (!facilityStatus) return;
  facilityStatus.textContent = message || '';
  facilityStatus.classList.remove('status-success', 'status-error', 'status-info');
  if (message) {
    facilityStatus.classList.add(`status-${type}`);
  }
}

closeButtons.forEach((btn) => btn.addEventListener('click', hideModal));
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    hideModal();
  }
});

if (confirmSendBtn) {
  confirmSendBtn.addEventListener('click', confirmAndSend);
}

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

async function loadFacilities() {
  setFacilityStatus('Loading facilities...', 'info');
  try {
    const response = await fetch('facility_map.cgi', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Facility request failed: ${response.status}`);
    }

    const data = await response.json();
    const incoming = Array.isArray(data.facilities) ? data.facilities : [];
    facilities = normalizeFacilities(incoming.length ? incoming : defaultFacilities);
    renderFacilityTable();
    refreshHospitalOptions();
    setFacilityStatus('Facilities loaded', 'success');
  } catch (err) {
    console.error(err);
    facilities = defaultFacilities.map((facility) => ({ ...facility }));
    renderFacilityTable();
    refreshHospitalOptions();
    setFacilityStatus('Using default facilities (database unavailable)', 'error');
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

    buildHospitalOptions(select, facilities[0]?.name);

    sendBtn.addEventListener('click', async () => {
      const selectedHospital = select.value;
      const selectedAction = [...radios].find((r) => r.checked)?.value || 'A01';
      const facility = facilities.find((f) => f.name === selectedHospital) || {
        name: selectedHospital,
        code: selectedHospital,
        sendingId: 'SPAAPP',
      };
      await sendRequest({
        patientId: patient.id,
        patientMrn: patient.mrn,
        action: selectedAction,
        facilityName: facility.name,
        facilityCode: facility.code,
        sendingId: facility.sendingId,
      });
    });

    tableBody.appendChild(clone);
  });
}

async function sendRequest(payload) {
  try {
    const params = new URLSearchParams({
      patient_id: String(payload.patientId || ''),
      facility_name: payload.facilityName,
      facility_code: payload.facilityCode,
      sending_id: payload.sendingId,
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
    showModal(text, {
      patientId: payload.patientId,
      mrn: payload.patientMrn,
      action: payload.action,
      hospital: payload.facilityName,
    });
  } catch (err) {
    console.error(err);
    showModal(`Generation failed. Showing sample message instead.\n\n${sampleHl7()}`);
  }
}

async function confirmAndSend() {
  if (!latestPreview || !modalBody.textContent) {
    setModalStatus('No HL7 message available to send.', 'error');
    return;
  }

  const payload = {
    hl7_message: modalBody.textContent,
    patient_id: latestPreview.patientId || '',
    mrn: latestPreview.mrn || '',
    action: latestPreview.action || '',
    hospital: latestPreview.hospital || '',
  };

  confirmSendBtn.disabled = true;
  setModalStatus('Sending message...', 'info');

  try {
    const response = await fetch('write_hl7.cgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.status !== 'success') {
      throw new Error(data.message || `Request failed: ${response.status}`);
    }

    setModalStatus('HL7 message written to file successfully.', 'success');
  } catch (err) {
    console.error(err);
    setModalStatus(err.message || 'Failed to write HL7 message.', 'error');
  } finally {
    confirmSendBtn.disabled = false;
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
    'MSH|^~\\&|SPAAPP|SGH|HIS|SGH|202511201530||ADT^A01|MSG00001|P|2.5.1',
    'EVN|A01|202511201530',
    'PID|1||MRN00001||Smith^John^A||19800314|M|||123 Maple St^^New York^NY^10001',
    'PV1|1|I|ER^^^Seattle Grace Hospital|||||||||||||||||||',
  ].join('\n');
}

reloadBtn.addEventListener('click', fetchPatients);

function normalizeFacilities(list) {
  return (list || []).map((facility) => ({
    name: facility.name || '',
    code: facility.code || '',
    sendingId: facility.sendingId || facility.sending_id || 'SPAAPP',
  }));
}

function buildHospitalOptions(select, selectedValue) {
  const previous = select.value;
  select.innerHTML = '';
  facilities.forEach((facility) => {
    const option = document.createElement('option');
    option.value = facility.name;
    option.textContent = facility.name;
    select.appendChild(option);
  });

  const target = facilities.find((f) => f.name === previous) ? previous : selectedValue || facilities[0]?.name;
  if (target) {
    select.value = target;
  }
}

function renderFacilityTable() {
  facilityTableBody.innerHTML = '';
  facilities.forEach((facility, index) => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = facility.name;
    nameInput.addEventListener('input', (e) => updateFacility(index, 'name', e.target.value));
    nameCell.appendChild(nameInput);

    const codeCell = document.createElement('td');
    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.value = facility.code;
    codeInput.addEventListener('input', (e) => updateFacility(index, 'code', e.target.value));
    codeCell.appendChild(codeInput);

    const sendingCell = document.createElement('td');
    const sendingInput = document.createElement('input');
    sendingInput.type = 'text';
    sendingInput.value = facility.sendingId;
    sendingInput.addEventListener('input', (e) => updateFacility(index, 'sendingId', e.target.value));
    sendingCell.appendChild(sendingInput);

    row.appendChild(nameCell);
    row.appendChild(codeCell);
    row.appendChild(sendingCell);

    facilityTableBody.appendChild(row);
  });

  refreshHospitalOptions();
}

function updateFacility(index, field, value) {
  facilities[index] = { ...facilities[index], [field]: value };
  refreshHospitalOptions();
  setFacilityStatus('Unsaved changes', 'info');
}

function refreshHospitalOptions() {
  document.querySelectorAll('.hospital-select').forEach((select) => buildHospitalOptions(select, select.value));
}

addFacilityBtn.addEventListener('click', () => {
  facilities.push({ name: '', code: '', sendingId: '' });
  renderFacilityTable();
  setFacilityStatus('Unsaved changes', 'info');
});

resetFacilityBtn.addEventListener('click', () => {
  facilities = defaultFacilities.map((facility) => ({ ...facility }));
  renderFacilityTable();
  refreshHospitalOptions();
  saveFacilities();
});

saveFacilityBtn.addEventListener('click', saveFacilities);

async function saveFacilities() {
  setFacilityStatus('Saving facilities...', 'info');
  try {
    const response = await fetch('facility_map.cgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facilities }),
    });

    if (!response.ok) {
      throw new Error(`Save failed: ${response.status}`);
    }

    setFacilityStatus('Facilities saved', 'success');
  } catch (err) {
    console.error(err);
    setFacilityStatus('Failed to save facilities', 'error');
  }
}

renderFacilityTable();
loadFacilities();
fetchPatients();
