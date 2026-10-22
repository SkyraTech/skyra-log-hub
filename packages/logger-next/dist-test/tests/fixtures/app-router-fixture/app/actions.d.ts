export interface CreateOrderInput {
    orderId: string;
    amount: number;
}
export declare const createOrderAction: (input: CreateOrderInput) => Promise<{
    success: boolean;
    orderId: string;
    status: string;
}>;
//# sourceMappingURL=actions.d.ts.map