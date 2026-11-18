import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { emptyEditorContent } from '../src/lib/editor-content';
import { setPageOffer, pageOfferOptions } from '../src/lib/page-offers';
import { publishFunnelPage, loadPublishedPage } from '../src/lib/funnel-publishing';

const db = createDatabaseClient(process.env.DATABASE_URL);
const uid = () => randomUUID().replaceAll('-', '');
const owner = `offers_${uid()}`, admin = `${owner}_admin`; const accountIds: string[] = [];
before(async () => { await db.user.createMany({ data: [{ id: owner }, { id: admin }] }); });
after(async () => { try { await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, admin] } } }); await db.connectAccountSync.deleteMany({ where: { accountId: { in: accountIds } } }); } finally { await db.$disconnect(); } });
async function fixture() {
  const accountId = `acct_${uid()}`; accountIds.push(accountId);
  const agency = await db.agency.create({ data: { ownerId: owner, name: 'Offer fixture', stripeConnectAccountId: accountId } });
  await db.agencyMembership.create({ data: { agencyId: agency.id, userId: admin, role: 'ADMIN' } });
  const sub = await db.subAccount.create({ data: { agencyId: agency.id, name: 'Offer workspace' } });
  const funnel = await db.funnel.create({ data: { subAccountId: sub.id, name: 'Offer funnel' } });
  const page = await db.funnelPage.create({ data: { subAccountId: sub.id, funnelId: funnel.id, name: 'Offer page', path: '/', draftContent: emptyEditorContent() } });
  const priceId = `price_${uid()}`;
  await db.connectAccountSync.create({ data: { accountId, linkedStartedAt: new Date() } });
  await db.agencyCatalog.create({ data: { agencyId: agency.id, accountId, syncToken: randomUUID(), syncedAt: new Date(), products: [{ id: `prod_${uid()}`, name: 'Service', active: true, prices: [{ id: priceId, active: true, supported: true, currency: 'usd', amount: 1000, type: 'one_time' }] }] } });
  const scope = async () => ({ subAccountId: sub.id, funnelId: funnel.id, pageId: page.id, revision: (await db.funnel.findUniqueOrThrow({ where: { id: funnel.id } })).revision });
  const domain = `offer-${uid()}`;
  const publish = async (actor = owner) => publishFunnelPage(db, actor, { ...await scope(), subdomain: domain, operation: 'publish', confirmed: true });
  return { agency, sub, funnel, page, accountId, priceId, scope, publish, domain };
}
test('only owners can see options and configure a workspace page offer', async () => {
  const f = await fixture(); const input = { ...await f.scope(), priceId: f.priceId };
  assert.equal(await pageOfferOptions(db, admin, f.sub.id, f.funnel.id), null);
  assert.equal(await pageOfferOptions(db, 'missing', f.sub.id, f.funnel.id), null);
  assert.equal((await pageOfferOptions(db, owner, f.sub.id, f.funnel.id))?.prices[0].id, f.priceId);
  await assert.rejects(setPageOffer(db, admin, input)); await assert.rejects(setPageOffer(db, 'missing', input));
  await setPageOffer(db, owner, input);
  const page = await db.funnelPage.findUniqueOrThrow({ where: { id: f.page.id } });
  assert.equal((page.draftOffer as { accountId: string }).accountId, f.accountId); assert.equal(page.publishedOffer, null);
});
test('unknown prices, forged account or amount fields and foreign page scopes are rejected', async () => {
  const f = await fixture(), other = await fixture(); const input = { ...await f.scope(), priceId: f.priceId };
  for (const patch of [{ priceId: other.priceId }, { accountId: other.accountId }, { amount: 1 }, { pageId: other.page.id }, { subAccountId: other.sub.id }]) await assert.rejects(setPageOffer(db, owner, { ...input, ...patch }));
  assert.equal((await db.funnelPage.findUniqueOrThrow({ where: { id: f.page.id } })).draftOffer, null);
});
test('publish snapshots the offer and draft removal stays private until owner republishes', async () => {
  const f = await fixture(); await setPageOffer(db, owner, { ...await f.scope(), priceId: f.priceId });
  await assert.rejects(f.publish(admin), /owner/); await f.publish();
  const first = await db.funnelPage.findUniqueOrThrow({ where: { id: f.page.id } }); assert.deepEqual(first.publishedOffer, first.draftOffer);
  await setPageOffer(db, owner, { ...await f.scope(), priceId: '' });
  assert.deepEqual((await db.funnelPage.findUniqueOrThrow({ where: { id: f.page.id } })).publishedOffer, first.publishedOffer);
  await assert.rejects(f.publish(admin), /owner/); await f.publish();
  assert.equal((await db.funnelPage.findUniqueOrThrow({ where: { id: f.page.id } })).publishedOffer, null);
  const publicPage = await loadPublishedPage(db, f.domain, '/'); assert.ok(publicPage); assert.ok(!JSON.stringify(publicPage).includes(f.accountId));
});
test('reconnecting the same account requires selecting the offer again', async () => {
  const f = await fixture(); await setPageOffer(db, owner, { ...await f.scope(), priceId: f.priceId });
  await db.connectAccountSync.update({ where: { accountId: f.accountId }, data: { linkedStartedAt: new Date(Date.now() + 2000) } });
  await assert.rejects(f.publish(), /connection changed/);
  await setPageOffer(db, owner, { ...await f.scope(), priceId: f.priceId }); await f.publish();
});
test('revocation prevents configuration/publishing while owner can still clear the draft', async () => {
  const f = await fixture(); await setPageOffer(db, owner, { ...await f.scope(), priceId: f.priceId });
  await db.agency.update({ where: { id: f.agency.id }, data: { stripeConnectAccountId: null } });
  await assert.rejects(f.publish(), /connection changed/);
  await assert.rejects(setPageOffer(db, owner, { ...await f.scope(), priceId: f.priceId }));
  await setPageOffer(db, owner, { ...await f.scope(), priceId: '' }); await f.publish();
});
test('concurrent offer updates cannot overwrite a newer revision', async () => {
  const f = await fixture(); const input = { ...await f.scope(), priceId: f.priceId };
  const results = await Promise.allSettled([setPageOffer(db, owner, input), setPageOffer(db, owner, input)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});
test('unpublishing clears only the published offer and disabled workspaces reject edits', async () => {
  const f = await fixture(); await setPageOffer(db, owner, { ...await f.scope(), priceId: f.priceId }); await f.publish();
  await publishFunnelPage(db, admin, { ...await f.scope(), subdomain: f.domain, operation: 'unpublish', confirmed: true });
  const page = await db.funnelPage.findUniqueOrThrow({ where: { id: f.page.id } }); assert.equal(page.publishedOffer, null); assert.ok(page.draftOffer);
  await db.subAccount.update({ where: { id: f.sub.id }, data: { enabled: false } });
  await assert.rejects(setPageOffer(db, owner, { ...await f.scope(), priceId: '' }));
});
