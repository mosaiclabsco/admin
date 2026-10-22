-- Local/full Supabase database QA. Synthetic fixtures only; rollback preserves existing data.
begin;
do $$
declare uid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();pid uuid;other_pid uuid;other_plan uuid;aid uuid;cid uuid;blocked boolean;
begin
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(uid,'admin-management-fixture@example.invalid','{}','{}');
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,uid,now(),now());
 insert into public.admins(user_id,email) values(uid,'admin-management-fixture@example.invalid');
 select id into pid from public.platforms where slug='lessonara';
 insert into public.platforms(slug,name) values('qa-'||left(gen_random_uuid()::text,8),'Other platform fixture') returning id into other_pid;
 insert into public.plans(platform_id,code,name,price_cents) values(other_pid,'QA','Fixture',4900) returning id into other_plan;
 insert into public.accounts(platform_id,external_id,name) values(pid,'qa-'||uid::text,'Management fixture') returning id into aid;
 blocked:=false;begin update public.accounts set plan_id=other_plan where id=aid;exception when foreign_key_violation then blocked:=true;end;
 if not blocked then raise exception 'Cross-platform plan accepted';end if;
 insert into public.charges(account_id,period,amount_cents,due_on) values(aid,date_trunc('month',now())::date,4900,(now() at time zone 'America/Sao_Paulo')::date) returning id into cid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid)::text,true);
 if not public.is_admin() then raise exception 'Fresh admin denied';end if;
 blocked:=false;begin perform public.settle_platform_charge(cid,'pix',(now() at time zone 'America/Sao_Paulo')::date+1,4900,'fixture');exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Future payment accepted';end if;
 blocked:=false;begin perform public.settle_platform_charge(cid,'pix',(now() at time zone 'America/Sao_Paulo')::date,-1,'fixture');exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Negative payment accepted';end if;
 perform public.settle_platform_charge(cid,'pix',(now() at time zone 'America/Sao_Paulo')::date,4900,'fixture');
 if (select count(*) from public.audit_log where entity_id=cid::text)<>1 or (select paid_amount_cents from public.charges where id=cid)<>4900 then raise exception 'Payment/audit failed';end if;
 blocked:=false;begin perform public.settle_platform_charge(cid,'pix',(now() at time zone 'America/Sao_Paulo')::date,4900,'retry');exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'Duplicate payment';end if;
 perform set_config('admin.test_session',sid::text,true);perform set_config('admin.test_charge',cid::text,true);
end;$$;
set local role authenticated;
do $$begin
 if not public.is_admin() or not exists(select 1 from public.accounts) then raise exception 'Admin RLS denied';end if;
end;$$;
reset role;
update auth.sessions set created_at=now()-interval '13 hours' where id=current_setting('admin.test_session')::uuid;
set local role authenticated;
do $$declare blocked boolean:=false;begin
 if public.is_admin() or exists(select 1 from public.accounts) then raise exception 'Expired admin RLS allowed';end if;
 begin perform public.settle_platform_charge(current_setting('admin.test_charge')::uuid,'pix',(now() at time zone 'America/Sao_Paulo')::date,4900,'retry');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Expired admin payment allowed';end if;
end;$$;
reset role;
select 'OK: full local Supabase schema, admin RLS, 12h expiry, cross-platform plan denied, payment/audit transaction, duplicate/future/negative payment denied. Fixtures rolled back.' as validation;
rollback;
