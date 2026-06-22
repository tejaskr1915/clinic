/* ========================================
   Sri Sheshashayi Multispeciality Dental Clinic
   Main JavaScript
   ======================================== */

// Detect if we're running from a file:// URL (no server) or via http://
const isFileProtocol = window.location.protocol === 'file:';

// If accessed via http:// (server running), use dynamic origin for API
// If accessed via file:// (direct open), disable server calls entirely
const API_URL = isFileProtocol ? null : `${window.location.origin}/api`;

const CLINIC_MAPS_LINK = 'https://share.google/6C62APk3ROePjW2Ir';
let bookedSlots = [];
let lastAppointment = null;

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function openWhatsApp() {
    if (!lastAppointment) return;
    const { name, phone, date, time } = lastAppointment;
    const whatsappMessage = `*Appointment Confirmation*\n\nName: ${name}\nPhone: ${phone}\nDate: ${date}\nTime: ${time}\n\nClinic Location: ${CLINIC_MAPS_LINK}`;
    const encoded = encodeURIComponent(whatsappMessage);
    const waUrl = `https://wa.me/919342573236?text=${encoded}`;
    
    // Use window.location instead of window.open for mobile compatibility
    window.location.href = waUrl;
    
    closeModal('success-modal');
}

async function loadBookedSlots(date) {
    try {
        const select = document.getElementById('popup-time');
        if (!select) return;
        const options = select.querySelectorAll('option:not([value=""])');
        options.forEach(opt => {
            opt.disabled = false;
            opt.style.color = '';
            opt.style.backgroundColor = '';
        });
        if (!date) return;

        // Try fetching from server only if we have an API_URL (not file://)
        if (API_URL) {
            try {
                const response = await fetch(`${API_URL}/appointments?date=${date}`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    cache: 'no-cache',
                    signal: AbortSignal.timeout(2000)
                });
                if (response.ok) {
                    const appointments = await response.json();
                    bookedSlots = appointments.filter(a => a.date === date).map(a => a.time);
                    markBookedSlots(options);
                    return;
                }
            } catch (e) {
                // Server fetch failed, fall through to localStorage
            }
        }

        // Fallback to localStorage
        const local = JSON.parse(localStorage.getItem('dentalAppointments') || '[]');
        bookedSlots = local.filter(a => a.date === date).map(a => a.time);
        markBookedSlots(options);
        
    } catch (e2) {}
}

function markBookedSlots(options) {
    if (bookedSlots.length > 0) {
        options.forEach(opt => {
            if (bookedSlots.includes(opt.value)) {
                opt.disabled = true;
                opt.title = 'This time slot is already booked';
                opt.style.color = '#dc2626';
                opt.style.backgroundColor = '#fee2e2';
            }
        });
    }
}

document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'popup-date') {
        loadBookedSlots(e.target.value);
    }
});

function showServiceDetails(title, description) {
    alert(`${title}\n\n${description}`);
}

function submitAppointmentToServer(e) {
    // Prevent form from submitting/reloading the page
    if (e) e.preventDefault();

    const name = document.getElementById('popup-name').value.trim();
    const phone = document.getElementById('popup-phone').value.trim();
    const email = document.getElementById('popup-email').value.trim();
    const date = document.getElementById('popup-date').value;
    const time = document.getElementById('popup-time').value;
    const selectedIndex = document.getElementById('popup-time').selectedIndex;
    const selectEl = document.getElementById('popup-time');
    // Validate Full Name - only alphabets and spaces allowed
    const nameRegex = /^[a-zA-Z\s]+$/;
    if (!nameRegex.test(name)) {
        alert('⚠️ Full Name should contain only alphabets (A-Z, a-z) and spaces.');
        return false;
    }
    if (name.trim().length < 2) {
        alert('⚠️ Full Name must be at least 2 characters long.');
        return false;
    }

    // Validate Phone Number - exactly 10 digits starting with 6-9
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
        alert('⚠️ Phone number must be exactly 10 digits and must start with 6, 7, 8, or 9.\n\nExample: 9876543210');
        return false;
    }

    // Validate Email - must contain @ and proper format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('⚠️ Please enter a valid email address.\n\nExample: user@example.com');
        return false;
    }

    // Check if selected time slot is already booked
    if (selectEl.options[selectedIndex] && selectEl.options[selectedIndex].disabled) {
        alert('❌ This time slot is already booked. Please choose another slot.');
        return false;
    }

    const appointmentData = { name, phone, email, date, time };

    // Save to localStorage immediately
    try {
        const appointments = JSON.parse(localStorage.getItem('dentalAppointments') || '[]');
        appointments.push({ ...appointmentData, status: 'Pending' });
        localStorage.setItem('dentalAppointments', JSON.stringify(appointments));
    } catch (e) {}

    // Show success popup IMMEDIATELY
    showSuccessPopup(name, phone, date, time);
    document.getElementById('quick-appointment-form').reset();
    loadBookedSlots(date);

    // Try to save to server in background ONLY if not file:// protocol
    if (API_URL) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        fetch(`${API_URL}/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appointmentData),
            signal: controller.signal
        })
        .then(response => {
            clearTimeout(timeoutId);
            if (response.ok) {
                fetch(`${API_URL}/send-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...appointmentData, mapsLink: CLINIC_MAPS_LINK })
                }).catch(() => {});
            }
        })
        .catch(() => {
            clearTimeout(timeoutId);
        });
    }

    return false;
}

function showSuccessPopup(name, phone, date, time) {
    lastAppointment = { name, phone, date, time };
    
    // Format date nicely (e.g., "24 June 2026")
    let formattedDate = date;
    try {
        const parts = date.split('-');
        if (parts.length === 3) {
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            formattedDate = parseInt(parts[2]) + ' ' + months[parseInt(parts[1]) - 1] + ' ' + parts[0];
        }
    } catch(e) {}
    
    const nameEl = document.getElementById('success-name');
    const dateEl = document.getElementById('success-date');
    const timeEl = document.getElementById('success-time');
    
    if (nameEl) nameEl.textContent = name;
    if (dateEl) dateEl.textContent = formattedDate;
    if (timeEl) timeEl.textContent = time;
    
    const successModal = document.getElementById('success-modal');
    if (successModal) {
        successModal.style.display = 'flex';
    }
}

async function loadAppointmentsFromServer() {
    const tableBody = document.getElementById('appointments-table-body');
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:25px;">Loading appointments...</td></tr>';

    try {
        if (!API_URL) {
            throw new Error('No server (file:// mode)');
        }

        const response = await fetch(`${API_URL}/appointments`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            cache: 'no-cache'
        });

        if (!response.ok) {
            throw new Error('Server response not available');
        }

        const appointments = await response.json();

        if (appointments.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:25px;">✅ No appointments booked yet</td></tr>';
            return;
        }

        tableBody.innerHTML = appointments.map(apt => `
            <tr>
                <td>${apt.name}</td>
                <td>${apt.phone}</td>
                <td>${apt.email || '-'}</td>
                <td>${apt.date}</td>
                <td>${apt.time}</td>
                <td style="color: ${apt.status === 'Success' ? '#10b981' : apt.status === 'Pending' ? '#0F6CBF' : '#dc2626'}; font-weight:600;">${apt.status}</td>
                <td>
                    <button onclick="updateAppointmentStatus(${apt.id}, 'Success')" style="background:#10b981; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.8rem;">✓ Mark Done</button>
                </td>
            </tr>
        `).join('');

        document.getElementById('clear-appointments').onclick = async function() {
            if(confirm('Are you sure you want to delete all appointments?')) {
                await fetch(`${API_URL}/appointments`, { method: 'DELETE' });
                loadAppointmentsFromServer();
            }
        };

    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:25px; color: #dc2626;">⚠️ Server offline - showing local appointments</td></tr>';
        const appointments = JSON.parse(localStorage.getItem('dentalAppointments') || '[]');

        if (appointments.length > 0) {
            tableBody.innerHTML += appointments.map(apt => `
                <tr>
                    <td>${apt.name}</td>
                    <td>${apt.phone}</td>
                    <td>${apt.date}</td>
                    <td>${apt.time}</td>
                    <td style="color: #0F6CBF; font-weight:600;">${apt.status}</td>
                </tr>
            `).join('');
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }

    const header = document.getElementById('header');
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                header.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.12)';
            } else {
                header.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.08)';
            }
        });
    }

    const counters = document.querySelectorAll('.counter-number');
    if (counters.length && !window.countersAnimated) {
        window.countersAnimated = true;
        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-target'));
            const duration = 2000;
            const increment = target / (duration / 16);
            let current = 0;

            const updateCounter = () => {
                current += increment;
                if (current < target) {
                    counter.textContent = Math.floor(current);
                    requestAnimationFrame(updateCounter);
                } else {
                    counter.textContent = target;
                }
            };

            updateCounter();
        });
    }

    const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card, .service-card, .testimonial-card, .faq-item, .counters').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.6s ease-out';
        observer.observe(el);
    });

    const style = document.createElement('style');
    style.textContent = `.visible { opacity: 1 !important; transform: translateY(0) !important; }`;
    document.head.appendChild(style);

    // Set today's date as default for date picker
    const dateInput = document.getElementById('popup-date');
    if (dateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    // Attach submit handler to the appointment form
    const form = document.getElementById('quick-appointment-form');
    if (form) {
        form.addEventListener('submit', submitAppointmentToServer);
    }

    console.log('✅ Sri Sheshashayi Dental Clinic Website Loaded Successfully');
    console.log(`   Mode: ${isFileProtocol ? 'Offline (file://)' : 'Server (' + window.location.origin + ')'}`);
});