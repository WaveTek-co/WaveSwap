// Export components explicitly to avoid naming conflicts
export {
  Button,
  Input,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Badge,
  Spinner,
  TokenSelector,
  SwapDetails,
  TransactionStatus,
  PriceChart,
  WalletButton,
  WalletBalance,
  Modal,
  Dialog,
  Form,
  Container,
  Grid,
  Flex,
  Alert,
  Toast,
  EmptyState,
  Tabs,
  Accordion,
  Avatar,
  Tooltip,
  Popover,
  FormField,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  TabsList,
  TabsTrigger,
  TabsContent,
  AccordionItem,
  AccordionTrigger,
  AccordionContent
} from './components'

// Export hooks
export * from './hooks'

// Export utilities
export * from './lib/utils'

// Export types (explicitly to avoid conflicts)
export type {
  Token,
  SwapQuote,
  Route,
  Step,
  TransactionStatus as TransactionStatusType,
  UIState,
  BaseComponentProps,
  ButtonProps,
  FormField as FormFieldType,
  Network,
  WaveSwapError
} from './types'

// Export styles (for consumers who want to import CSS)
import './styles/index.css'