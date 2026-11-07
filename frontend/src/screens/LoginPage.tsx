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
        <main className="tk-create">
            <h1>Sign in</h1>
            <section className="tk-form">
                <h2>Account</h2>
                <p className="tk-note">
                    Sign in with the CVAT account. The dashboard stays in Octate, and annotation opens in CVAT.
                </p>
                <label>
                    Username
                    <input value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
                </label>
                <label>
                    Password
                    <input
                        type="password"
                        value={password}
                        autoComplete="current-password"
                        onChange={(event) => setPassword(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") void submit();
                        }}
                    />
                </label>
                {error && <p className="tk-error">{error}</p>}
                <div className="tk-actions">
                    <button className="tk-primary" type="button" disabled={pending || !username.trim() || !password} onClick={() => void submit()}>
                        {pending ? "Signing in" : "Sign in"}
                    </button>
                </div>
            </section>
        </main>
    );
}
