import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, MessageSquare, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { telegramManager } from '@/lib/telegram';
import { storage } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import type { TelegramSession } from '@shared/schema';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (session: TelegramSession) => void;
}

type AuthStep = 'login-options' | 'credentials' | 'phone' | 'code' | 'password' | 'custom-session';

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<AuthStep>('login-options');
  const [customSessionString, setCustomSessionString] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({
    apiId: '28403662',
    apiHash: '079509d4ac7f209a1a58facd00d6ff5a',
    phoneNumber: '+917352013479',
    code: '',
    password: '',
  });

  const { toast } = useToast();

  useEffect(() => {
    // Listen for Telegram events
    const handleCodeRequired = (event: CustomEvent) => {
      setStep('code');
      setLoading(false);
    };

    const handlePasswordRequired = (event: CustomEvent) => {
      setStep('password');
      setLoading(false);
    };

    window.addEventListener('telegram:code-required', handleCodeRequired as EventListener);
    window.addEventListener('telegram:password-required', handlePasswordRequired as EventListener);

    return () => {
      window.removeEventListener('telegram:code-required', handleCodeRequired as EventListener);
      window.removeEventListener('telegram:password-required', handlePasswordRequired as EventListener);
    };
  }, []);

  const handleInputChange = (field: keyof typeof credentials, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  // Handler for using default session string
  const handleUseDefaultSession = async () => {
    setLoading(true);
    setError('');

    try {
      const predefinedSessionString = "1BQAWZmxvcmEud2ViLnRlbGVncmFtLm9yZwG7IS3tNY2BsIDLeDQnewXF0dZ7iEc231dYk/8TDX83hkgf7EwJ8HvdsqxWr/Dyb8oeEIe6+H9MAgI4yPaGs0IgIsdLQozbCnlNF7NDC+q5iC+JlpLbAF2PIiZ3nHvetmRyadZpTsVSLFgSG1BdvVUx2J65VHdkbJTk9V0hj2Wq3ucMrBNGJB6oCSrnSqWCD5mmtxKdFDV6p+6Fj1d0gbnmBOkhV0Ud+V6NRHDup/j6rREt/lJTO8gXowmd2dLt1piiQrmD3fU+zKEFf4Mv0GllJYYKY9aVxQjjhowXM8GdKnX0DLxOFVcqSk7sOkCn14ocdtYK4ffhRgJdgu241XriLA==";
      const sessionData: TelegramSession = {
        sessionString: predefinedSessionString,
        apiId: 28403662,
        apiHash: "079509d4ac7f209a1a58facd00d6ff5a",
        phoneNumber: "+917352013479",
        userId: 'default-user',
        firstName: 'Default',
        lastName: 'User',
      };

      await telegramManager.loadSession(sessionData);
      await storage.saveSession(sessionData);
      
      // Set localStorage flag to prevent modal from showing again
      localStorage.setItem('telegram_session', 'active');

      toast({
        title: 'Default Session Loaded!',
        description: 'Successfully logged in with default session',
      });

      onSuccess(sessionData);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to load default session');
    }
  };

  // Handler for using custom session string
  const handleUseCustomSession = async () => {
    if (!customSessionString.trim()) {
      setError('Please enter a session string');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sessionData: TelegramSession = {
        sessionString: customSessionString.trim(),
        apiId: 28403662,
        apiHash: "079509d4ac7f209a1a58facd00d6ff5a",
        phoneNumber: "custom-session",
        userId: 'custom-user',
        firstName: 'Custom',
        lastName: 'User',
      };

      await telegramManager.loadSession(sessionData);
      await storage.saveSession(sessionData);
      
      // Set localStorage flag to prevent modal from showing again
      localStorage.setItem('telegram_session', 'active');

      toast({
        title: 'Custom Session Loaded!',
        description: 'Successfully logged in with custom session',
      });

      onSuccess(sessionData);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to load custom session');
    }
  };

  const handleCredentialsSubmit = async () => {
    if (!credentials.apiId || !credentials.apiHash) {
      setError('Please provide both API ID and API Hash');
      return;
    }

    const apiId = parseInt(credentials.apiId);
    if (isNaN(apiId)) {
      setError('API ID must be a number');
      return;
    }

    setError('');
    setStep('phone');
  };

  const handlePhoneSubmit = async () => {
    if (!credentials.phoneNumber) {
      setError('Please enter your phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await telegramManager.authenticate(
        credentials.phoneNumber,
        parseInt(credentials.apiId),
        credentials.apiHash
      );
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  const handleCodeSubmit = async () => {
    if (!credentials.code) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Send the code response
      window.dispatchEvent(new CustomEvent('telegram:code-response', {
        detail: { code: credentials.code }
      }));

      // Optimized session polling for faster response
      let attempts = 0;
      const maxAttempts = 40; // 10 seconds max with 250ms intervals
      
      const pollSession = async () => {
        try {
          const session = telegramManager.getSession();
          if (session) {
            // Save session to storage for persistence
            await storage.saveSession(session);
            
            // Set localStorage flag to prevent modal from showing again
            localStorage.setItem('telegram_session', 'active');
            
            toast({
              title: 'Welcome!',
              description: `Successfully logged in as ${session.firstName || session.phoneNumber}`,
            });
            
            onSuccess(session);
            setLoading(false);
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(pollSession, 250); // Check every 250ms for fast response
          } else {
            throw new Error('Session not created after authentication - please try again');
          }
        } catch (err) {
          console.error('Post-authentication error:', err);
          setError(err instanceof Error ? err.message : 'Authentication failed');
          setLoading(false);
        }
      };
      
      // Start polling immediately
      setTimeout(pollSession, 100);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Code verification failed');
    }
  };

  const handlePasswordSubmit = async () => {
    if (!credentials.password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Send the password response
      window.dispatchEvent(new CustomEvent('telegram:password-response', {
        detail: { password: credentials.password }
      }));

      // Optimized session polling for 2FA - faster response
      let attempts = 0;
      const maxAttempts = 40; // 10 seconds max with 250ms intervals
      
      const pollSession = async () => {
        try {
          const session = telegramManager.getSession();
          if (session) {
            // Save session to storage for persistence
            await storage.saveSession(session);
            
            // Set localStorage flag to prevent modal from showing again
            localStorage.setItem('telegram_session', 'active');
            
            toast({
              title: 'Welcome!',
              description: `Successfully logged in as ${session.firstName || session.phoneNumber}`,
            });
            
            onSuccess(session);
            setLoading(false);
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(pollSession, 250); // Check every 250ms for fast response
          } else {
            throw new Error('Session not created after 2FA authentication - please try again');
          }
        } catch (err) {
          console.error('Post-2FA authentication error:', err);
          setError(err instanceof Error ? err.message : 'Authentication failed');
          setLoading(false);
        }
      };
      
      // Start polling immediately
      setTimeout(pollSession, 100);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Password verification failed');
    }
  };

  const handleClose = () => {
    if (!loading) {
      setStep('login-options');
      setCredentials({
        apiId: '28403662',
        apiHash: '079509d4ac7f209a1a58facd00d6ff5a',
        phoneNumber: '+917352013479',
        code: '',
        password: '',
      });
      setCustomSessionString('');
      setError('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            {step === 'login-options' && <MessageSquare className="w-5 h-5" />}
            {step === 'credentials' && <Phone className="w-5 h-5" />}
            {step === 'phone' && <Phone className="w-5 h-5" />}
            {(step === 'code' || step === 'password') && <MessageSquare className="w-5 h-5" />}
            {step === 'custom-session' && <MessageSquare className="w-5 h-5" />}
            <span>
              {step === 'login-options' && 'Choose Login Method'}
              {step === 'credentials' && 'Telegram API Credentials'}
              {step === 'phone' && 'Enter Phone Number'}
              {step === 'code' && 'Verification Code'}
              {step === 'password' && 'Two-Factor Password'}
              {step === 'custom-session' && 'Enter Session String'}
            </span>
          </DialogTitle>
          {step === 'login-options' && (
            <DialogDescription>
              Choose how you want to login to Telegram Manager.
            </DialogDescription>
          )}
          {step === 'credentials' && (
            <DialogDescription>
              Enter your Telegram API credentials to authenticate with Telegram servers.
            </DialogDescription>
          )}
          {step === 'phone' && (
            <DialogDescription>
              Enter your phone number registered with Telegram to receive a verification code.
            </DialogDescription>
          )}
          {step === 'code' && (
            <DialogDescription>
              Enter the verification code sent to your phone number.
            </DialogDescription>
          )}
          {step === 'password' && (
            <DialogDescription>
              Enter your two-factor authentication password to complete login.
            </DialogDescription>
          )}
          {step === 'custom-session' && (
            <DialogDescription>
              Enter your Telegram session string to login instantly.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'login-options' && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-6">
                  Choose your preferred login method
                </p>
              </div>

              <div className="space-y-3">
                <Button 
                  onClick={handleUseDefaultSession} 
                  className="w-full h-12 text-left justify-start"
                  variant="outline"
                  disabled={loading}
                  data-testid="button-default-session"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <div className="flex items-center space-x-3">
                    <MessageSquare className="w-5 h-5" />
                    <div>
                      <div className="font-medium">Use Default Session</div>
                      <div className="text-xs text-muted-foreground">Login instantly with saved session</div>
                    </div>
                  </div>
                </Button>

                <Button 
                  onClick={() => setStep('custom-session')} 
                  className="w-full h-12 text-left justify-start"
                  variant="outline"
                  data-testid="button-custom-session"
                >
                  <div className="flex items-center space-x-3">
                    <MessageSquare className="w-5 h-5" />
                    <div>
                      <div className="font-medium">Enter Session String</div>
                      <div className="text-xs text-muted-foreground">Login with your own session string</div>
                    </div>
                  </div>
                </Button>

                <Button 
                  onClick={() => setStep('credentials')} 
                  className="w-full h-12 text-left justify-start"
                  variant="outline"
                  data-testid="button-full-auth"
                >
                  <div className="flex items-center space-x-3">
                    <Phone className="w-5 h-5" />
                    <div>
                      <div className="font-medium">Full Authentication</div>
                      <div className="text-xs text-muted-foreground">Login with API ID, Hash, and OTP</div>
                    </div>
                  </div>
                </Button>
              </div>
            </div>
          )}

          {step === 'custom-session' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your Telegram session string to login instantly without OTP verification.
              </p>

              <div className="space-y-2">
                <Label htmlFor="session-string">Session String</Label>
                <Input
                  id="session-string"
                  type="password"
                  placeholder="1BQAWZmxvcmE..."
                  value={customSessionString}
                  onChange={(e) => setCustomSessionString(e.target.value)}
                  data-testid="input-custom-session"
                />
              </div>

              <div className="flex space-x-2">
                <Button 
                  onClick={() => setStep('login-options')} 
                  variant="outline"
                  className="flex-1"
                  data-testid="button-back-to-options"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleUseCustomSession} 
                  className="flex-1"
                  disabled={loading}
                  data-testid="button-login-custom-session"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Login
                </Button>
              </div>
            </div>
          )}

          {step === 'credentials' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your Telegram API credentials. You can get these from{' '}
                <a 
                  href="https://my.telegram.org/apps" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  my.telegram.org/apps
                </a>
              </p>

              <div className="space-y-2">
                <Label htmlFor="api-id">API ID</Label>
                <Input
                  id="api-id"
                  type="number"
                  placeholder="123456789"
                  value={credentials.apiId}
                  onChange={(e) => handleInputChange('apiId', e.target.value)}
                  data-testid="input-api-id"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-hash">API Hash</Label>
                <Input
                  id="api-hash"
                  type="password"
                  placeholder="abcdef123456789..."
                  value={credentials.apiHash}
                  onChange={(e) => handleInputChange('apiHash', e.target.value)}
                  data-testid="input-api-hash"
                />
              </div>

              <div className="flex space-x-2">
                <Button 
                  onClick={() => setStep('login-options')} 
                  variant="outline"
                  className="flex-1"
                  data-testid="button-back-to-options-from-credentials"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleCredentialsSubmit} 
                  className="flex-1"
                  data-testid="button-credentials-submit"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 'phone' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your phone number to receive a verification code
              </p>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 234 567 8900"
                  value={credentials.phoneNumber}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  data-testid="input-phone"
                />
              </div>

              <Button 
                onClick={handlePhoneSubmit} 
                className="w-full"
                disabled={loading}
                data-testid="button-send-code"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Code
              </Button>
            </div>
          )}

          {step === 'code' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the verification code sent to{' '}
                <span className="font-medium">{credentials.phoneNumber}</span>
              </p>

              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="12345"
                  value={credentials.code}
                  onChange={(e) => handleInputChange('code', e.target.value)}
                  className="text-center text-lg tracking-wider"
                  data-testid="input-verification-code"
                />
              </div>

              <Button 
                onClick={handleCodeSubmit} 
                className="w-full"
                disabled={loading}
                data-testid="button-verify-code"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify Code
              </Button>
            </div>
          )}

          {step === 'password' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your account has two-factor authentication enabled. Please enter your password.
              </p>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={credentials.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  data-testid="input-password"
                />
              </div>

              <Button 
                onClick={handlePasswordSubmit} 
                className="w-full"
                disabled={loading}
                data-testid="button-verify-password"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify Password
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}