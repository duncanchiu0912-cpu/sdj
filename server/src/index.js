import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be set to a random secret of at least 32 characters.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

const cookieOptions = { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };
const registerSchema = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(72), name: z.string().trim().min(1).max(60) });
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(72) });
const invoiceSchema = z.object({ number: z.string().trim().min(1).max(24), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), seller: z.string().trim().min(1).max(100), amount: z.number().int().min(0).max(999999999), category: z.enum(['餐飲','交通','購物','生活','娛樂','醫療','其他']).default('其他'), taxType: z.enum(['電子發票','紙本發票','收據','網購訂單']).default('電子發票'), note: z.string().max(500).default('') });
const publicUser = user => ({ id: user.id, name: user.name, email: user.email });
function setSession(res, user) { res.cookie('invoice_session', jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d', issuer: 'invoice-ledger' }), cookieOptions); }
function auth(req, res, next) {
  try { const token = req.cookies.invoice_session; if (!token) return res.status(401).json({ error: '請先登入會員。' }); const payload = jwt.verify(token, JWT_SECRET, { issuer: 'invoice-ledger' }); req.userId = payload.sub; next(); }
  catch { res.clearCookie('invoice_session', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' }); return res.status(401).json({ error: '登入已逾期，請重新登入。' }); }
}
function validate(schema, body) { const result = schema.safeParse(body); if (!result.success) { const err = new Error(result.error.issues[0]?.message || '欄位資料格式不正確。'); err.status = 400; throw err; } return result.data; }

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/auth/register', async (req, res, next) => {
  try { const input = validate(registerSchema, req.body); const email = input.email.trim().toLowerCase(); const exists = await prisma.user.findUnique({ where: { email } }); if (exists) return res.status(409).json({ error: '此電子郵件已註冊，請直接登入。' }); const passwordHash = await bcrypt.hash(input.password, 12); const user = await prisma.user.create({ data: { email, name: input.name, passwordHash } }); setSession(res, user); res.status(201).json({ user: publicUser(user) }); }
  catch (e) { if (e.code === 'P2002') return res.status(409).json({ error: '此電子郵件已註冊，請直接登入。' }); next(e); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try { const input = validate(loginSchema, req.body); const user = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } }); if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: '電子郵件或密碼不正確。' }); setSession(res, user); res.json({ user: publicUser(user) }); } catch (e) { next(e); }
});
app.post('/api/auth/logout', (_req, res) => { res.clearCookie('invoice_session', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' }); res.json({ ok: true }); });
app.get('/api/auth/me', auth, async (req, res, next) => { try { const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, email: true } }); if (!user) return res.status(401).json({ error: '會員不存在，請重新登入。' }); res.json({ user }); } catch (e) { next(e); } });
app.get('/api/invoices', auth, async (req, res, next) => { try { const invoices = await prisma.invoice.findMany({ where: { userId: req.userId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }); res.json({ invoices }); } catch (e) { next(e); } });
app.post('/api/invoices', auth, async (req, res, next) => { try { const data = validate(invoiceSchema, req.body); const invoice = await prisma.invoice.create({ data: { ...data, userId: req.userId } }); res.status(201).json({ invoice }); } catch (e) { if (e.code === 'P2002') return res.status(409).json({ error: '這個發票號碼已經在你的存摺中。' }); next(e); } });
app.put('/api/invoices/:id', auth, async (req, res, next) => { try { const data = validate(invoiceSchema, req.body); const result = await prisma.invoice.updateMany({ where: { id: req.params.id, userId: req.userId }, data }); if (!result.count) return res.status(404).json({ error: '找不到這筆消費紀錄。' }); const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, userId: req.userId } }); res.json({ invoice }); } catch (e) { if (e.code === 'P2002') return res.status(409).json({ error: '這個發票號碼已經在你的存摺中。' }); next(e); } });
app.delete('/api/invoices/:id', auth, async (req, res, next) => { try { const result = await prisma.invoice.deleteMany({ where: { id: req.params.id, userId: req.userId } }); if (!result.count) return res.status(404).json({ error: '找不到這筆消費紀錄。' }); res.json({ ok: true }); } catch (e) { next(e); } });

app.use((err, _req, res, _next) => { console.error(err); if (res.headersSent) return; res.status(err.status || 500).json({ error: err.status ? err.message : '伺服器發生錯誤，請稍後再試。' }); });

if (isProduction) {
  const clientDist = new URL('../../client/dist/', import.meta.url).pathname;
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile('index.html', { root: clientDist }));
} else {
  const viteOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  app.use('/api', (req, res, next) => { res.setHeader('Access-Control-Allow-Origin', viteOrigin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });
}

const server = app.listen(PORT, () => console.log(`Invoice ledger API listening on http://localhost:${PORT}`));
async function shutdown() { server.close(async () => { await prisma.$disconnect(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
