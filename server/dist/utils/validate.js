function safeParse(data) {
    try {
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
export { safeParse };
//# sourceMappingURL=validate.js.map