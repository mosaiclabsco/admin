import { describe, expect, it } from "vitest";
import { parseAccessChange } from "./management-rules";
const teacher = "11111111-1111-4111-8111-111111111111";
function form() { const f = new FormData(); for (const [k,v] of Object.entries({ access_plan: "pro", access_status: "suspended", access_revision: "3", operation: "22222222-2222-4222-8222-222222222222", reason: "Requested plan change" })) f.set(k,v); return f; }
describe("teacher management input", () => {
 it("accepts explicit plan, revision, reason and suspension", () => { expect(parseAccessChange(form(),teacher)).toMatchObject({teacherId:teacher, plan:"pro", suspended:true, revision:3}); });
 it.each([["access_plan","enterprise"],["access_status","true"],["access_revision",""],["access_revision","-1"],["access_revision","1.5"],["access_revision","9007199254740992"],["reason"," "],["reason","a".repeat(501)],["operation","anything"]])("rejects invalid %s", (key,value) => { const f=form(); f.set(key,value); expect(()=>parseAccessChange(f,teacher)).toThrow(); });
 it("never accepts a teacher ID submitted by the browser", () => { const f=form();f.set("teacherId","other");expect(parseAccessChange(f,teacher).teacherId).toBe(teacher); });
 it("rejects invalid source account identity", () => {expect(()=>parseAccessChange(form(),"manual-123")).toThrow();});
 it("requires explicit access selection", () => {const f=form();f.delete("access_status");expect(()=>parseAccessChange(f,teacher)).toThrow();});
});
