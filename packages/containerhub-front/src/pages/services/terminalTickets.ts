const terminalTickets = new Map<string, string>()

export function rememberTerminalTicket(taskId: string, ticket: string): void {
    terminalTickets.set(taskId, ticket)
}

export function consumeTerminalTicket(taskId: string): string | undefined {
    const ticket = terminalTickets.get(taskId)
    terminalTickets.delete(taskId)
    return ticket
}
