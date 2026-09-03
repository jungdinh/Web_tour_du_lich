declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

interface GoogleCredentialResponse {
  credential: string
  select_by?: string
  clientId?: string
}

interface GoogleButtonOptions {
  theme?: string
  size?: string
  text?: string
  shape?: string
  logo_alignment?: string
  width?: string | number
}

interface GoogleIdentityServices {
  initialize: (options: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
  }) => void
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void
  cancel: () => void
}

interface Window {
  google?: {
    accounts?: {
      id?: GoogleIdentityServices
    }
  }
}
