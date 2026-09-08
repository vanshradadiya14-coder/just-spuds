import { Component, type ErrorInfo, type ReactNode } from 'react'
import { SITE } from '../data/site'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Antigravity Caught UI Render Exception:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[80vh] flex items-center justify-center p-6 bg-paper">
          <div className="w-full max-w-lg rounded-3xl border border-ink/10 bg-white p-8 sm:p-10 shadow-2xl text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/20 text-3xl">
              🥔
            </div>
            
            <span className="font-body text-[11px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
              Something Took an Unexpected Turn
            </span>

            <h2 className="display text-3xl text-ink mt-3">
              Don't worry, we're on it!
            </h2>

            <p className="font-body text-xs text-slate-600 mt-2 leading-relaxed">
              We encountered a temporary hiccup loading this screen. Your saved cart and orders are safe in your browser.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto rounded-full bg-ink px-6 py-3 font-body text-xs font-black uppercase tracking-wider text-white shadow hover:bg-slate-800 transition"
              >
                ↻ Refresh &amp; Restore Page
              </button>

              <a
                href={`tel:${SITE.phone}`}
                className="w-full sm:w-auto rounded-full border border-ink/15 bg-white px-6 py-3 font-body text-xs font-bold text-ink hover:bg-paper transition"
              >
                📞 Call Shop ({SITE.town})
              </a>
            </div>

            <p className="mt-6 font-mono text-[10px] text-slate-400 border-t border-ink/8 pt-4">
              Error code: {this.state.error?.message || 'UNEXPECTED_RENDER_EXCEPTION'}
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
