drop policy if exists "members read trust audits" on public.trust_audits;
create policy "members read owned trust audits" on public.trust_audits
for select using (organization_id is not null and public.is_org_member(organization_id));

drop policy if exists "members read proof metrics" on public.proof_metrics;
create policy "members read owned proof metrics" on public.proof_metrics
for select using (organization_id is not null and public.is_org_member(organization_id));

revoke all on public.rate_limits from anon, authenticated;
revoke all on public.contact_messages from anon, authenticated;
revoke all on public.billing_events from anon, authenticated;
