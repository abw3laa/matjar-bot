import React from "react";
import { TouchableOpacity, Text } from "react-native";
import { NavigationContainer, DarkTheme, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { OrdersListScreen } from "@/screens/OrdersListScreen";
import { OrderDetailScreen } from "@/screens/OrderDetailScreen";
import { PostsListScreen } from "@/screens/PostsListScreen";
import { SocialPostComposerScreen } from "@/screens/SocialPostComposerScreen";
import { EscalatedConversationsListScreen } from "@/screens/EscalatedConversationsListScreen";
import { ConversationDetailScreen } from "@/screens/ConversationDetailScreen";
import { useAuth } from "@/auth/AuthContext";
import { colors } from "@/theme/colors";

export type OrdersStackParamList = {
  OrdersList: undefined;
  OrderDetail: { orderId: string };
};

export type SocialStackParamList = {
  PostsList: undefined;
  PostComposer: undefined;
};

export type ConversationsStackParamList = {
  ConversationsList: undefined;
  ConversationDetail: { conversationId: string; customerName: string; customerPhone: string };
};

export type RootTabParamList = {
  OrdersTab: undefined;
  SocialTab: undefined;
  ConversationsTab: undefined;
};

const OrdersStackNav = createNativeStackNavigator<OrdersStackParamList>();
const SocialStackNav = createNativeStackNavigator<SocialStackParamList>();
const ConversationsStackNav = createNativeStackNavigator<ConversationsStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.primary,
  },
};

const screenHeaderOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.textPrimary,
  headerShadowVisible: false,
};

function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <TouchableOpacity onPress={() => signOut()} style={{ paddingHorizontal: 4 }}>
      <Text style={{ color: colors.danger, fontWeight: "600" }}>خروج</Text>
    </TouchableOpacity>
  );
}

function OrdersStack() {
  return (
    <OrdersStackNav.Navigator screenOptions={screenHeaderOptions}>
      <OrdersStackNav.Screen
        name="OrdersList"
        component={OrdersListScreen}
        options={{ title: "الطلبات", headerLeft: () => <LogoutButton /> }}
      />
      <OrdersStackNav.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{ title: "تفاصيل الطلب" }}
      />
    </OrdersStackNav.Navigator>
  );
}

function NewPostButton() {
  const navigation = useNavigation<NativeStackNavigationProp<SocialStackParamList>>();
  return (
    <TouchableOpacity onPress={() => navigation.navigate("PostComposer")} style={{ paddingHorizontal: 4 }}>
      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>+ جديد</Text>
    </TouchableOpacity>
  );
}

function SocialStack() {
  return (
    <SocialStackNav.Navigator screenOptions={screenHeaderOptions}>
      <SocialStackNav.Screen
        name="PostsList"
        component={PostsListScreen}
        options={{ title: "المنشورات", headerRight: () => <NewPostButton /> }}
      />
      <SocialStackNav.Screen
        name="PostComposer"
        component={SocialPostComposerScreen}
        options={{ title: "منشور جديد" }}
      />
    </SocialStackNav.Navigator>
  );
}

function ConversationsStack() {
  return (
    <ConversationsStackNav.Navigator screenOptions={screenHeaderOptions}>
      <ConversationsStackNav.Screen
        name="ConversationsList"
        component={EscalatedConversationsListScreen}
        options={{ title: "محادثات بانتظار الرد" }}
      />
      <ConversationsStackNav.Screen
        name="ConversationDetail"
        component={ConversationDetailScreen}
        options={{ title: "المحادثة" }}
      />
    </ConversationsStackNav.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
        }}
      >
        <Tab.Screen name="OrdersTab" component={OrdersStack} options={{ title: "الطلبات" }} />
        <Tab.Screen
          name="ConversationsTab"
          component={ConversationsStack}
          options={{ title: "المحادثات" }}
        />
        <Tab.Screen name="SocialTab" component={SocialStack} options={{ title: "النشر" }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
