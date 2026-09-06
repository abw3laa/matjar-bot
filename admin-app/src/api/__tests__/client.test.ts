import axios from "axios";
import { toApiErrorInfo } from "@/api/client";

describe("toApiErrorInfo", () => {
  it("يعيد رسالة تعارض واضحة عند خطأ 409 (حالة طلب غير متوافقة)", () => {
    const error = {
      isAxiosError: true,
      response: { status: 409, data: {} },
    };
    jest.spyOn(axios, "isAxiosError").mockReturnValue(true);
    const result = toApiErrorInfo(error);
    expect(result.status).toBe(409);
    expect(result.message).toContain("حالة الطلب");
  });

  it("يستخدم رسالة الخادم عند توفرها لأي كود خطأ آخر", () => {
    const error = {
      isAxiosError: true,
      response: { status: 400, data: { message: "رقم الهاتف غير صالح" } },
    };
    jest.spyOn(axios, "isAxiosError").mockReturnValue(true);
    const result = toApiErrorInfo(error);
    expect(result.message).toBe("رقم الهاتف غير صالح");
    expect(result.status).toBe(400);
  });

  it("يعيد رسالة اتصال عامة عندما لا يوجد رد من الخادم إطلاقاً (فشل شبكة)", () => {
    const error = { isAxiosError: true, response: undefined };
    jest.spyOn(axios, "isAxiosError").mockReturnValue(true);
    const result = toApiErrorInfo(error);
    expect(result.message).toContain("الاتصال بالخادم");
    expect(result.status).toBeUndefined();
  });

  it("يعيد رسالة عامة لأي خطأ ليس من axios إطلاقاً", () => {
    jest.spyOn(axios, "isAxiosError").mockReturnValue(false);
    const result = toApiErrorInfo(new Error("something else"));
    expect(result.message).toBe("حدث خطأ غير متوقع");
  });
});
