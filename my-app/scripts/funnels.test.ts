import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { createAgency } from '../src/lib/agencies';
import { createSubAccount } from '../src/lib/subaccounts';
import { emptyAgencyValues } from '../src/lib/agency-validation';
import { createFunnel, getFunnel, listFunnels, mutateFunnel } from '../src/lib/funnels';
import { emptyEditorContent, validateEditorContent } from '../src/lib/editor-content';
import { getFunnelDraft, saveFunnelDraft } from '../src/lib/funnel-drafts';
import { applyEditorOperation } from '../src/lib/editor-operations';
import { safeEditorHref } from '../src/lib/editor-content';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DraftPreview } from '../src/components/agency/draft-preview';
import { publishFunnelPage, loadPublishedPage } from '../src/lib/funnel-publishing';
import { publishedHtml } from '../src/lib/published-html';
import { retireClientMedia } from '../src/lib/client-media';

const db = createDatabaseClient(process.env.DATABASE_URL);
const tag = `funnels_${randomUUID()}`;
const [owner, member, guest, outsider] = ['owner', 'member', 'guest', 'outsider'].map(role => `${tag}_${role}`);
const users = [owner, member, guest, outsider];
let agencyId: string, subAccountId: string, siblingId: string;
before(async () => {
  await db.user.createMany({ data: users.map(id => ({ id })) });
  agencyId = (await createAgency(db, owner, { ...emptyAgencyValues, name: 'Funnel fixture', creationKey: randomUUID() })).id;
  await db.agencyMembership.createMany({ data: [{ agencyId, userId: member, role: 'MEMBER' }, { agencyId, userId: guest, role: 'CLIENT' }] });
  subAccountId = (await createSubAccount(db, owner, { agencyId, name: 'Website client', creationKey: randomUUID() })).id;
  siblingId = (await createSubAccount(db, owner, { agencyId, name: 'Other client', creationKey: randomUUID() })).id;
  await db.subAccountMembership.createMany({ data: [{ agencyId, subAccountId, userId: member, role: 'MEMBER' }, { agencyId, subAccountId, userId: guest, role: 'GUEST' }] });
});
after(async () => { try { await db.agency.delete({ where: { id: agencyId } }); await db.user.deleteMany({ where: { id: { in: users } } }); } finally { await db.$disconnect(); } });
const create = (scope = subAccountId) => createFunnel(db, owner, { subAccountId: scope, name: 'Launch funnel', creationKey: randomUUID() });
const context = async (id: string) => ({ subAccountId, funnelId: id, revision: (await db.funnel.findUniqueOrThrow({ where: { id } })).revision });

test('funnel creation is idempotent and permissions deny unauthorized writes', async () => {
  const data = { subAccountId, name: 'Launch', creationKey: randomUUID() };
  const results = await Promise.all([createFunnel(db, owner, data), createFunnel(db, member, data)]);
  assert.equal(results[0].id, results[1].id);
  for (const actor of [guest, outsider]) await assert.rejects(createFunnel(db, actor, data));
  assert.ok(await getFunnel(db, guest, subAccountId, results[0].id));
  assert.equal(await listFunnels(db, outsider, subAccountId), null);
  assert.equal(await getFunnel(db, member, siblingId, (await create(siblingId)).id), null);
});

test('pages persist with validated empty drafts and paths are workspace-wide', async () => {
  const first = await create(), second = await create();
  await mutateFunnel(db, member, { ...await context(first.id), operation: 'create-page', name: 'Home', path: '/' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: first.id } });
  assert.deepEqual(page.draftContent, emptyEditorContent()); assert.equal(page.publishedAt, null);
  await assert.rejects(mutateFunnel(db, owner, { ...await context(second.id), operation: 'create-page', name: 'Conflict', path: '/' }), /already used/);
  await mutateFunnel(db, owner, { ...await context(first.id), operation: 'edit-page', pageId: page.id, name: 'Welcome', path: '/Welcome' });
  assert.equal((await db.funnelPage.findUniqueOrThrow({ where: { id: page.id } })).path, '/welcome');
});

test('foreign page IDs, guests and invalid paths cannot mutate drafts', async () => {
  const first = await create(), second = await create();
  await mutateFunnel(db, owner, { ...await context(first.id), operation: 'create-page', name: 'Contact', path: '/contact' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: first.id } });
  await assert.rejects(mutateFunnel(db, owner, { ...await context(second.id), operation: 'delete-page', pageId: page.id, confirmed: true }));
  await assert.rejects(mutateFunnel(db, guest, { ...await context(first.id), operation: 'rename', name: 'Forbidden' }));
  for (const path of ['/api/test', '//evil.com', '/a/../b', '/%2f', '/trailing/', 'javascript:bad', '/a?b', '/a#b']) await assert.rejects(mutateFunnel(db, owner, { ...await context(first.id), operation: 'create-page', name: 'Invalid', path }));
});

test('concurrent changes accept one revision and reject stale forms', async () => {
  const funnel = await create(); const scope = await context(funnel.id);
  const results = await Promise.allSettled(['First change', 'Second change'].map(name => mutateFunnel(db, owner, { ...scope, operation: 'rename', name })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await context(funnel.id)).revision, 1);
});

test('deletion requires confirmation and an empty funnel; published pages remain protected', async () => {
  const funnel = await create();
  await mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'create-page', name: 'Offer', path: '/offer' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  await assert.rejects(mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'delete', confirmed: true }));
  await assert.rejects(mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'delete-page', pageId: page.id, confirmed: false }));
  await db.funnelPage.update({ where: { id: page.id }, data: { publishedContent: emptyEditorContent(), publishedAt: new Date() } });
  await assert.rejects(mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'delete-page', pageId: page.id, confirmed: true }), /Published/);
  const draft = await create(); await mutateFunnel(db, owner, { ...await context(draft.id), operation: 'create-page', name: 'Draft', path: '/draft' });
  const draftPage = await db.funnelPage.findFirstOrThrow({ where: { funnelId: draft.id } });
  await mutateFunnel(db, owner, { ...await context(draft.id), operation: 'delete-page', pageId: draftPage.id, confirmed: true });
  await mutateFunnel(db, owner, { ...await context(draft.id), operation: 'delete', confirmed: true });
  assert.equal(await getFunnel(db, owner, subAccountId, draft.id), null);
});

test('deleted users cannot expose or mutate funnels', async () => {
  const funnel = await create(); await db.user.update({ where: { id: member }, data: { deletedAt: new Date() } });
  assert.equal(await getFunnel(db, member, subAccountId, funnel.id), null);
  await assert.rejects(mutateFunnel(db, member, { ...await context(funnel.id), operation: 'rename', name: 'Forbidden' }));
});

test('editor validation rejects executable fields, duplicate IDs, cycles and excessive depth', () => {
  assert.deepEqual(validateEditorContent(emptyEditorContent()), emptyEditorContent());
  assert.throws(() => validateEditorContent({ ...emptyEditorContent(), script: 'alert(1)' }));
  assert.throws(() => validateEditorContent({ version: 1, root: { id: 'root', type: 'container', children: [{ id: 'root', type: 'text', text: 'duplicate' }] } }));
  const cycle: Record<string, unknown> = {}; cycle.self = cycle; assert.throws(() => validateEditorContent(cycle));
  let deep: unknown = { id: 'text', type: 'text', text: 'end' }; for (let i = 0; i < 30; i++) deep = { id: `node${i}`, type: 'container', children: [deep] };
  assert.throws(() => validateEditorContent({ version: 1, root: deep }));
  assert.throws(() => validateEditorContent({ version: 1, root: { id: 'root', type: 'container', children: [{ id: 'a', type: 'html', html: '<script />' }] } }));
});

test('draft save/reload preserves published content and rejects guests or foreign page scopes', async () => {
  const funnel = await create();
  await mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'create-page', name: 'Editor', path: '/editor' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  const publishedAt = new Date();
  await db.funnelPage.update({ where: { id: page.id }, data: { publishedContent: emptyEditorContent(), publishedAt } });
  const content = applyEditorOperation(emptyEditorContent(), { type: 'add', parentId: 'root', node: { id: 'text1', type: 'text', text: '<script>alert(1)</script>' } });
  const input = { ...await context(funnel.id), pageId: page.id, content };
  await assert.rejects(saveFunnelDraft(db, guest, input));
  await assert.rejects(saveFunnelDraft(db, outsider, input));
  await assert.rejects(saveFunnelDraft(db, owner, { ...input, subAccountId: siblingId }));
  await assert.rejects(saveFunnelDraft(db, owner, { ...input, funnelId: (await create()).id }));
  await saveFunnelDraft(db, owner, input);
  assert.deepEqual((await getFunnelDraft(db, guest, subAccountId, funnel.id, page.id))?.page.content, content);
  assert.equal(await getFunnelDraft(db, outsider, subAccountId, funnel.id, page.id), null);
  const saved = await db.funnelPage.findUniqueOrThrow({ where: { id: page.id } });
  assert.deepEqual(saved.publishedContent, emptyEditorContent()); assert.equal(saved.publishedAt?.getTime(), publishedAt.getTime());
});

test('invalid content cannot change a draft and concurrent saves reject the stale writer', async () => {
  const funnel = await create();
  await mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'create-page', name: 'Concurrent editor', path: '/editor-concurrency' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  const input = { ...await context(funnel.id), pageId: page.id, content: emptyEditorContent() };
  await assert.rejects(saveFunnelDraft(db, owner, { ...input, content: { version: 1, root: { id: 'root', type: 'script' } } }));
  assert.equal((await context(funnel.id)).revision, input.revision);
  const results = await Promise.allSettled([saveFunnelDraft(db, owner, input), saveFunnelDraft(db, owner, input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  await assert.rejects(saveFunnelDraft(db, member, { ...input, revision: input.revision + 1 })); // member was soft-deleted above
});

test('editor operations preserve input, support nested blocks and moves, and reject unsafe changes', () => {
  const initial = emptyEditorContent();
  let doc = applyEditorOperation(initial, { type: 'add', parentId: 'root', node: { id: 'section', type: 'container', children: [] } });
  doc = applyEditorOperation(doc, { type: 'add', parentId: 'section', node: { id: 'one', type: 'text', text: 'First' } });
  doc = applyEditorOperation(doc, { type: 'add', parentId: 'section', node: { id: 'two', type: 'text', text: 'Second' } });
  doc = applyEditorOperation(doc, { type: 'move', id: 'two', direction: -1 });
  doc = applyEditorOperation(doc, { type: 'text', id: 'two', text: 'Updated' });
  const section = doc.root.type === 'container' ? doc.root.children[0] : null;
  assert.equal(section?.type, 'container');
  if (section?.type === 'container') assert.deepEqual(section.children.map(child => child.id), ['two', 'one']);
  assert.deepEqual(initial, emptyEditorContent());
  assert.throws(() => applyEditorOperation(doc, { type: 'remove', id: 'root' }));
  assert.throws(() => applyEditorOperation(doc, { type: 'add', parentId: 'section', node: { id: 'one', type: 'text', text: 'duplicate' } }));
  assert.throws(() => applyEditorOperation(doc, { type: 'text', id: 'two', text: 'x'.repeat(10001) }));
  doc = applyEditorOperation(doc, { type: 'remove', id: 'section' });
  assert.deepEqual(doc, emptyEditorContent());
});

test('new elements and styles save/reload while existing version-1 drafts remain valid', async () => {
  const funnel = await create();
  await mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'create-page', name: 'Styled page', path: '/styled-page' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  let content = applyEditorOperation(emptyEditorContent(), { type: 'add', parentId: 'root', node: { id: 'heading', type: 'heading', text: 'Welcome', level: 1 } });
  content = applyEditorOperation(content, { type: 'add', parentId: 'root', node: { id: 'button', type: 'button', text: 'Contact', href: '/contact' } });
  content = applyEditorOperation(content, { type: 'style', id: 'heading', style: { color: '#112233', backgroundColor: '#ffffff', padding: 24, fontSize: 48, textAlign: 'center', borderRadius: 8 } });
  content = applyEditorOperation(content, { type: 'level', id: 'heading', level: 2 });
  content = applyEditorOperation(content, { type: 'href', id: 'button', href: 'https://example.com/contact' });
  await saveFunnelDraft(db, owner, { ...await context(funnel.id), pageId: page.id, content });
  assert.deepEqual((await getFunnelDraft(db, owner, subAccountId, funnel.id, page.id))?.page.content, content);
  assert.deepEqual(validateEditorContent(emptyEditorContent()), emptyEditorContent());
});

test('unsafe destinations and arbitrary CSS cannot enter saved content', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,bad', '//evil.com', '/\\evil.com', 'http://example.com', 'https://user:password@example.com', 'https://example.com\n', '']) assert.equal(safeEditorHref(href), false, href);
  for (const href of ['/', '/contact?source=page#form', '#contact', 'https://example.com']) assert.equal(safeEditorHref(href), true, href);
  for (const style of [{ padding: -1 }, { fontSize: 200 }, { color: 'url(https://example.com)' }, { backgroundImage: 'url(https://example.com)' }, { position: 'fixed' }, { textAlign: 'invalid' }]) {
    assert.throws(() => validateEditorContent({ version: 1, root: { id: 'root', type: 'container', style, children: [] } }));
  }
  assert.throws(() => validateEditorContent({ version: 1, root: { id: 'root', type: 'container', children: [{ id: 'bad', type: 'button', text: 'Bad', href: 'javascript:alert(1)' }] } }));
});

test('preview renders semantic headings, escapes markup and does not create navigating links', () => {
  const doc = validateEditorContent({ version: 1, root: { id: 'root', type: 'container', children: [
    { id: 'heading', type: 'heading', text: '<script>alert(1)</script>', level: 2, style: { fontSize: 32, padding: 12 } },
    { id: 'button', type: 'button', text: 'Go', href: 'https://example.com' },
  ] } });
  const html = renderToStaticMarkup(createElement(DraftPreview, { node: doc.root }));
  assert.match(html, /<h2/); assert.match(html, /font-size:32px/); assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('href=')); assert.match(html, /<button type="button"/);
});

test('image drafts accept only workspace-owned media and never expose foreign URLs', async () => {
  const funnel = await create();
  await mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'create-page', name: 'Images', path: '/images' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  const media = await db.media.create({ data: { subAccountId, storageKey: randomUUID(), name: 'Our image', url: 'https://example.com/own.webp', mimeType: 'image/webp', sizeBytes: BigInt(100) } });
  const foreign = await db.media.create({ data: { subAccountId: siblingId, storageKey: randomUUID(), name: 'Foreign image', url: 'https://example.com/foreign.webp', mimeType: 'image/webp', sizeBytes: BigInt(100) } });
  const imageDoc = (mediaId: string) => applyEditorOperation(emptyEditorContent(), { type: 'add', parentId: 'root', node: { id: 'image', type: 'image', mediaId, alt: 'Agency team' } });
  await assert.rejects(saveFunnelDraft(db, owner, { ...await context(funnel.id), pageId: page.id, content: imageDoc(foreign.id) }), /unavailable/);
  await saveFunnelDraft(db, owner, { ...await context(funnel.id), pageId: page.id, content: imageDoc(media.id) });
  const loaded = (await getFunnelDraft(db, guest, subAccountId, funnel.id, page.id))!;
  assert.ok(loaded.media.some(item => item.id === media.id)); assert.ok(!JSON.stringify(loaded).includes('foreign.webp'));
  assert.deepEqual(loaded.page.content, imageDoc(media.id));
  const html = renderToStaticMarkup(createElement(DraftPreview, { node: loaded.page.content.root, media: loaded.media }));
  assert.match(html, /own.webp/); assert.match(html, /alt="Agency team"/);
  await db.media.delete({ where: { id: media.id } });
  const missing = (await getFunnelDraft(db, owner, subAccountId, funnel.id, page.id))!;
  assert.match(renderToStaticMarkup(createElement(DraftPreview, { node: missing.page.content.root, media: missing.media })), /Image unavailable/);
  await assert.rejects(saveFunnelDraft(db, owner, { ...await context(funnel.id), pageId: page.id, content: missing.page.content }), /unavailable/);
  await saveFunnelDraft(db, owner, { ...await context(funnel.id), pageId: page.id, content: emptyEditorContent() });
});

test('image content rejects arbitrary source URLs and retains media identity through history operations', () => {
  assert.throws(() => validateEditorContent({ version: 1, root: { id: 'root', type: 'container', children: [{ id: 'image', type: 'image', mediaId: 'owned', alt: '', src: 'https://example.com/untrusted' }] } }));
  const doc = applyEditorOperation(emptyEditorContent(), { type: 'add', parentId: 'root', node: { id: 'image', type: 'image', mediaId: 'owned', alt: '' } });
  const updated = applyEditorOperation(doc, { type: 'image', id: 'image', mediaId: 'replacement', alt: 'Updated description' });
  assert.ok(JSON.stringify(updated).includes('replacement')); assert.ok(!JSON.stringify(doc).includes('replacement'));
  assert.throws(() => applyEditorOperation(doc, { type: 'image', id: 'image', mediaId: 'owned', alt: 'x'.repeat(501) }));
});

test('publishing isolates saved snapshots, requires access/confirmation and supports taking pages offline', async () => {
  const funnel = await create(); const subdomain = `site-${randomUUID().replaceAll('-', '')}`;
  await mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'create-page', name: 'Public page', path: '/published' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  const first = applyEditorOperation(emptyEditorContent(), { type: 'add', parentId: 'root', node: { id: 'text', type: 'text', text: 'Public snapshot' } });
  await saveFunnelDraft(db, owner, { ...await context(funnel.id), pageId: page.id, content: first });
  const input = { ...await context(funnel.id), pageId: page.id, subdomain, operation: 'publish', confirmed: true };
  await assert.rejects(publishFunnelPage(db, guest, input)); await assert.rejects(publishFunnelPage(db, outsider, input));
  await assert.rejects(publishFunnelPage(db, owner, { ...input, confirmed: false }));
  await assert.rejects(publishFunnelPage(db, owner, { ...input, subdomain: 'api' }));
  assert.equal(await loadPublishedPage(db, subdomain, '/published'), null);
  await publishFunnelPage(db, owner, input);
  await assert.rejects(publishFunnelPage(db, owner, input), /changed/);
  const newer = applyEditorOperation(first, { type: 'text', id: 'text', text: 'Unpublished secret' });
  await saveFunnelDraft(db, owner, { ...await context(funnel.id), pageId: page.id, content: newer });
  assert.deepEqual((await loadPublishedPage(db, subdomain, '/published'))?.content, first);
  assert.equal(await loadPublishedPage(db, 'unmapped-tenant', '/published'), null);
  await db.subAccount.update({ where: { id: subAccountId }, data: { enabled: false } });
  assert.equal(await loadPublishedPage(db, subdomain, '/published'), null);
  await db.subAccount.update({ where: { id: subAccountId }, data: { enabled: true } });
  await publishFunnelPage(db, owner, { ...input, ...await context(funnel.id), operation: 'unpublish' });
  assert.equal(await loadPublishedPage(db, subdomain, '/published'), null);
  assert.deepEqual((await getFunnelDraft(db, owner, subAccountId, funnel.id, page.id))?.page.content, newer);
});

test('published images cannot be retired until their page is unpublished', async () => {
  const funnel = await create();
  const account = await db.subAccount.findUniqueOrThrow({ where: { id: subAccountId } });
  await mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'create-page', name: 'Published image', path: '/retained-image' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  const asset = await db.mediaAsset.create({ data: { actorId: owner, subAccountId, status: 'ACTIVE', fileKey: randomUUID() } });
  const media = await db.media.create({ data: { id: asset.id, subAccountId, storageKey: asset.fileKey!, name: 'Retained image', mimeType: 'image/webp', sizeBytes: BigInt(100), url: 'https://example.com/retained.webp' } });
  const content = applyEditorOperation(emptyEditorContent(), { type: 'add', parentId: 'root', node: { id: 'image', type: 'image', mediaId: media.id, alt: 'Retained' } });
  await saveFunnelDraft(db, owner, { ...await context(funnel.id), pageId: page.id, content });
  const input = { pageId: page.id, subdomain: account.subdomain!, operation: 'publish', confirmed: true };
  await publishFunnelPage(db, owner, { ...await context(funnel.id), ...input });
  await assert.rejects(retireClientMedia(db, owner, subAccountId, media.id), /published page/);
  assert.ok(await db.media.findUnique({ where: { id: media.id } }));
  await publishFunnelPage(db, owner, { ...await context(funnel.id), ...input, operation: 'unpublish' });
  await retireClientMedia(db, owner, subAccountId, media.id);
  assert.equal(await db.media.findUnique({ where: { id: media.id } }), null);
  await assert.rejects(publishFunnelPage(db, owner, { ...await context(funnel.id), ...input }), /unavailable images/);
});

test('public HTML escapes content and attributes while retaining validated links', () => {
  const content = applyEditorOperation(emptyEditorContent(), { type: 'add', parentId: 'root', node: { id: 'button', type: 'button', text: '<script>alert(1)</script>', href: 'https://example.com/?x="unsafe"' } });
  const html = publishedHtml('<title attack>', content, []);
  assert.ok(html.includes('&lt;title attack&gt;')); assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&quot;unsafe&quot;')); assert.ok(html.includes('href="https://example.com/'));
});

test('a sibling workspace cannot claim an existing subdomain', async () => {
  const funnel = await create(siblingId); const account = await db.subAccount.findUniqueOrThrow({ where: { id: subAccountId } });
  await mutateFunnel(db, owner, { subAccountId: siblingId, funnelId: funnel.id, revision: 0, operation: 'create-page', name: 'Other site', path: '/' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  await assert.rejects(publishFunnelPage(db, owner, { subAccountId: siblingId, funnelId: funnel.id, pageId: page.id, revision: 1, subdomain: account.subdomain!, operation: 'publish', confirmed: true }), /already in use/);
  assert.equal((await db.funnelPage.findUniqueOrThrow({ where: { id: page.id } })).publishedAt, null);
});

test('simultaneous image retirement and publication cannot leave a published missing image', async () => {
  const funnel = await create(); const account = await db.subAccount.findUniqueOrThrow({ where: { id: subAccountId } });
  await mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'create-page', name: 'Race page', path: '/publish-race' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  const asset = await db.mediaAsset.create({ data: { actorId: owner, subAccountId, status: 'ACTIVE', fileKey: randomUUID() } });
  await db.media.create({ data: { id: asset.id, subAccountId, storageKey: asset.fileKey!, name: 'Race image', mimeType: 'image/webp', sizeBytes: BigInt(100), url: 'https://example.com/race.webp' } });
  const content = applyEditorOperation(emptyEditorContent(), { type: 'add', parentId: 'root', node: { id: 'image', type: 'image', mediaId: asset.id, alt: '' } });
  await saveFunnelDraft(db, owner, { ...await context(funnel.id), pageId: page.id, content });
  const input = { ...await context(funnel.id), pageId: page.id, subdomain: account.subdomain!, operation: 'publish', confirmed: true };
  const results = await Promise.allSettled([publishFunnelPage(db, owner, input), retireClientMedia(db, owner, subAccountId, asset.id)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const current = await db.funnelPage.findUniqueOrThrow({ where: { id: page.id } });
  if (current.publishedAt) assert.ok(await db.media.findUnique({ where: { id: asset.id } }));
});

test('public HTTP serves only published snapshots on their tenant host', { skip: !process.env.PUBLISH_TEST_BASE_URL }, async () => {
  const base = new URL(process.env.PUBLISH_TEST_BASE_URL!);
  assert.ok(['localhost', '127.0.0.1'].includes(base.hostname));
  const funnel = await create(); const account = await db.subAccount.findUniqueOrThrow({ where: { id: subAccountId } });
  await mutateFunnel(db, owner, { ...await context(funnel.id), operation: 'create-page', name: 'HTTP published fixture', path: '/http-published' });
  const page = await db.funnelPage.findFirstOrThrow({ where: { funnelId: funnel.id } });
  await publishFunnelPage(db, owner, { ...await context(funnel.id), pageId: page.id, subdomain: account.subdomain!, operation: 'publish', confirmed: true });
  const response = await fetch(new URL('/http-published', base), { headers: { host: `${account.subdomain}.localhost:${base.port}` }, redirect: 'manual' });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-security-policy')!, /default-src 'none'/);
  assert.match(response.headers.get('cache-control')!, /no-store/); assert.match(await response.text(), /HTTP published fixture/);
  const unknown = await fetch(new URL('/http-published', base), { headers: { host: `not-published.localhost:${base.port}` }, redirect: 'manual' });
  assert.equal(unknown.status, 404);
});
