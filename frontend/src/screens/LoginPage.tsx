import { useState } from "react";

export function LoginPage({
    onSubmit,
}: {
    onSubmit: (username: string, password: string) => Promise<void>;
}) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [pending, setPending] = useState(false);

    const submit = async () => {
        if (!username.trim() || !password) return;
        setPending(true);
        setError("");
        try {
            await onSubmit(username.trim(), password);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Sign-in failed");
        } finally {
            setPending(false);
        }
    };

    return (
        <main className="auth-page">
            <form
                className="auth-card"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <h1>Sign in</h1>
                <p>Sign in to the Octate workspace.</p>
                <label>
                    Username
                    <input value={username} autoComplete="username" autoFocus onChange={(event) => setUsername(event.target.value)} />
                </label>
                <label>
                    Password
                    <input type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
                </label>
                {error && <p className="tk-error" role="alert">{error}</p>}
                <button className="tk-primary" type="submit" disabled={pending || !username.trim() || !password}>
                    {pending ? "Signing in…" : "Sign in"}
                </button>
            </form>
        </main>
    );
}
