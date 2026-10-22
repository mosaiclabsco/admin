import { expect, it } from "vitest";
import { checkLoginLimit } from "./login-limit";
it("distinguishes a database outage from an exhausted quota", async () => {
 expect(await checkLoginLimit({rpc: async()=>({data:null,error:{code:"connection_failed"}})},"test",5,600)).toBe("unavailable");
 expect(await checkLoginLimit({rpc: async()=>{throw new Error("offline");}},"test",5,600)).toBe("unavailable");
 expect(await checkLoginLimit({rpc: async()=>({data:false,error:null})},"test",5,600)).toBe("limited");
});
it("allows only an explicit true response", async () => {
 expect(await checkLoginLimit({rpc: async()=>({data:true,error:null})},"test",5,600)).toBe("allowed");
 expect(await checkLoginLimit({rpc: async()=>({data:null,error:null})},"test",5,600)).toBe("unavailable");
});
