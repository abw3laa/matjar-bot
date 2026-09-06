import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { LoginScreen } from "@/screens/LoginScreen";

const mockSignIn = jest.fn();

jest.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ signIn: mockSignIn, signOut: jest.fn(), admin: null, isLoading: false }),
}));

describe("LoginScreen", () => {
  beforeEach(() => {
    mockSignIn.mockClear();
  });

  it("يعرض العنوان وحقلي البريد وكلمة المرور", () => {
    render(<LoginScreen />);
    expect(screen.getByText("تطبيق الأدمن")).toBeTruthy();
    expect(screen.getByPlaceholderText("البريد الإلكتروني")).toBeTruthy();
    expect(screen.getByPlaceholderText("كلمة المرور")).toBeTruthy();
  });

  it("لا يستدعي signIn ويعرض رسالة تحقق عند الإرسال بحقول فارغة", () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("تسجيل الدخول"));
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.getByText("أدخل البريد الإلكتروني وكلمة المرور")).toBeTruthy();
  });

  it("يستدعي signIn بالقيم الصحيحة عند تعبئة الحقلين", () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("البريد الإلكتروني"), "admin@matjar.test");
    fireEvent.changeText(screen.getByPlaceholderText("كلمة المرور"), "secret123");
    fireEvent.press(screen.getByText("تسجيل الدخول"));
    expect(mockSignIn).toHaveBeenCalledWith("admin@matjar.test", "secret123");
  });
});
