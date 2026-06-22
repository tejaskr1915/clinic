const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Get all appointments
app.get('/api/appointments', (req, res) => {
    fs.readFile(path.join(__dirname, 'db.json'), 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read database' });
        }
        let db;
        try {
            db = JSON.parse(data);
        } catch {
            db = { appointments: [] };
        }
        const { date } = req.query;
        if (date) {
            return res.json(db.appointments.filter(a => a.date === date));
        }
        res.json(db.appointments);
    });
});

// Create new appointment
app.post('/api/appointments', (req, res) => {
    fs.readFile(path.join(__dirname, 'db.json'), 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read database' });
        }
        
        let db;
        try {
            db = JSON.parse(data);
        } catch {
            db = { appointments: [] };
        }
        
        const newAppointment = {
            id: Date.now(),
            ...req.body,
            status: 'Pending',
            createdAt: new Date().toLocaleString()
        };
        
        db.appointments.push(newAppointment);
        
        fs.writeFile(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2), (err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to save appointment' });
            }

            // Send WhatsApp notification (non-blocking)
            const { name, phone, date, time } = newAppointment;
            sendWhatsApp(phone, name, date, time, 'booked').catch(() => {});

            res.status(201).json(newAppointment);
        });
    });
});

// Update appointment status
app.put('/api/appointments/:id', (req, res) => {
    fs.readFile(path.join(__dirname, 'db.json'), 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read database' });
        }
        
        let db;
        try {
            db = JSON.parse(data);
        } catch {
            db = { appointments: [] };
        }
        
        const appointmentId = parseInt(req.params.id);
        
        db.appointments = db.appointments.map(apt => {
            if (apt.id === appointmentId) {
                return { ...apt, status: req.body.status };
            }
            return apt;
        });
        
        fs.writeFile(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2), (err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to update appointment' });
            }

            // If status changed to Success, send WhatsApp confirmation
            if (req.body.status === 'Success') {
                const appointment = db.appointments.find(a => a.id === appointmentId);
                if (appointment) {
                    sendWhatsApp(appointment.phone, appointment.name, appointment.date, appointment.time, 'confirmed').catch(() => {});
                }
            }

            res.json({ message: 'Appointment status updated' });
        });
    });
});

// Clear all appointments
app.delete('/api/appointments', (req, res) => {
    const db = { appointments: [] };
    fs.writeFile(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2), (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to clear appointments' });
        }
        res.json({ message: 'All appointments cleared' });
    });
});

// Green API WhatsApp credentials
const WA_INSTANCE = '7107657603';
const WA_TOKEN = '1edb3165ebdd4a70bc8b8d33fdafa2d96ab6f3f5d899485ea9';

async function checkWhatsAppNumber(phone) {
    try {
        const formattedPhone = phone.replace(/[^0-9]/g, '');
        const fullPhone = formattedPhone.length === 10 ? `91${formattedPhone}` : formattedPhone;
        const url = `https://api.green-api.com/waInstance${WA_INSTANCE}/checkWhatsapp/${WA_TOKEN}`;
        const response = await axios.post(url, { phoneNumber: fullPhone });
        return response.data.existsWhatsapp === true;
    } catch (error) {
        console.error(`Error checking WhatsApp for ${phone}:`, error.message);
        return false;
    }
}

async function sendWhatsApp(phone, patientName, date, time, status = 'booked') {
    try {
        // Format phone number: add 91 prefix for 10-digit Indian numbers
        const formattedPhone = phone.replace(/[^0-9]/g, '');
        const fullPhone = formattedPhone.length === 10 ? `91${formattedPhone}` : formattedPhone;
        
        // First check if number has WhatsApp
        const hasWhatsApp = await checkWhatsAppNumber(phone);
        if (!hasWhatsApp) {
            console.log(`⚠️ WhatsApp not available for ${phone} - number not registered on WhatsApp`);
            return { success: false, error: 'Number not registered on WhatsApp' };
        }
        
        const url = `https://api.green-api.com/waInstance${WA_INSTANCE}/sendMessage/${WA_TOKEN}`;

        let message;
        if (status === 'confirmed') {
            message = `
✅ *Appointment Confirmed - Sri Sheshashayi Dental Clinic*

Hello ${patientName},

Your appointment has been confirmed by the clinic.

📅 Date: ${date}
⏰ Time: ${time}

📍 Address: No. 1347, Pavan Heights, 60 Feet Road, AECS Layout, Kundalahalli, Bangalore - 560037
📞 Contact: +91 9342573236

Thank you for choosing Sri Sheshashayi Multispeciality Dental Clinic! 🦷
            `.trim();
        } else {
            message = `
🦷 *Appointment Booked - Sri Sheshashayi Dental Clinic*

Hello ${patientName},

Your appointment has been booked successfully.

📅 Date: ${date}
⏰ Time: ${time}

📍 Address: No. 1347, Pavan Heights, 60 Feet Road, AECS Layout, Kundalahalli, Bangalore - 560037
📞 Contact: +91 9342573236

Please arrive 10 minutes early. Thank you! 😊
            `.trim();
        }

        const response = await axios.post(url, {
            chatId: `${fullPhone}@c.us`,
            message: message
        });

        console.log(`✅ WhatsApp sent to ${phone} (${status})`);
        return { success: true, data: response.data };
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error(`❌ WhatsApp send failed for ${phone}:`, errorMsg);
        return { success: false, error: errorMsg };
    }
}

// Send WhatsApp confirmation
app.post('/api/send-whatsapp', async (req, res) => {
    const { phone, patientName, date, time, status } = req.body;

    if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    const result = await sendWhatsApp(phone, patientName, date, time, status || 'booked');

    if (result.success) {
        res.json({ message: 'WhatsApp sent successfully' });
    } else {
        res.status(500).json({ error: 'Failed to send WhatsApp: ' + result.error });
    }
});

// Send email confirmation
app.post('/api/send-email', async (req, res) => {
    const { email, name, phone, date, time, mapsLink } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    // Create transporter using Gmail (app password required)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'tejastejukr@gmail.com',
            pass: 'kbsh tybj icyu zhst'
        }
    });

    const mailOptions = {
        from: 'tejastejukr@gmail.com',
        to: email,
        subject: '✅ Appointment Confirmation - Sri Sheshashayi Dental Clinic',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #f5f8fc; border-radius: 16px;">
                <div style="background: linear-gradient(135deg, #0F6CBF, #0B5394); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="color: #fff; margin: 0; font-size: 1.5rem;">🦷 Sri Sheshashayi Dental</h1>
                    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0;">Appointment Confirmation</p>
                </div>
                <div style="background: #fff; padding: 24px; border-radius: 0 0 12px 12px;">
                    <p style="font-size: 1.1rem; color: #1F2937;"><strong>Dear ${name},</strong></p>
                    <p style="color: #6B7280;">Your appointment has been booked successfully. Here are the details:</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #6B7280;">Patient Name</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${name}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #6B7280;">Phone</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${phone}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #6B7280;">Date</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${date}</td></tr>
                        <tr><td style="padding: 8px; color: #6B7280;">Time</td><td style="padding: 8px; font-weight: 600;">${time}</td></tr>
                    </table>
                    <p style="color: #6B7280; font-size: 0.9rem;">📍 <strong>Address:</strong> No. 1347, Pavan Heights, 60 Feet Road, AECS Layout, Kundalahalli, Bangalore - 560037</p>
                    <p style="color: #6B7280; font-size: 0.9rem;">📞 <strong>Phone:</strong> <a href="tel:+919342573236" style="color: #0F6CBF;">+91 9342573236</a></p>
                    <p style="color: #6B7280; font-size: 0.9rem;">🗺️ <strong>Location:</strong> <a href="${mapsLink || 'https://share.google/6C62APk3ROePjW2Ir'}" target="_blank" style="color: #0F6CBF;">View on Google Maps</a></p>
                    <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;">
                    <p style="color: #9CA3AF; font-size: 0.8rem; text-align: center;">Thank you for choosing Sri Sheshashayi Multispeciality Dental Clinic!</p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: 'Email sent successfully' });
    } catch (error) {
        console.error('Email error:', error.message);
        res.status(500).json({ error: 'Failed to send email: ' + error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ Network access: http://192.168.68.103:${PORT}`);
    console.log(`✅ API Endpoints:`);
    console.log(`   GET    /api/appointments`);
    console.log(`   POST   /api/appointments`);
    console.log(`   PUT    /api/appointments/:id`);
    console.log(`   DELETE /api/appointments`);
    console.log(`   POST   /api/send-email`);
    console.log(`   POST   /api/send-whatsapp`);
});
