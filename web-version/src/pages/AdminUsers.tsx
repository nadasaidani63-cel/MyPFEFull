import { useState } from "react";
import { Users, Shield, Edit2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUsers, useUpdateUserRole, useRoleRequests, useReviewRoleRequest } from "@/hooks/useApiData";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const roleLabels: Record<string, string> = {
  admin: "Admin",
  utilisateur: "Utilisateur",
};

const roleBadge: Record<string, string> = {
  admin: "bg-status-critical/10 text-status-critical border-status-critical/30",
  utilisateur: "bg-muted text-muted-foreground border-border",
};

const AdminUsers = () => {
  const { role } = useAuth();
  const { data: users, isLoading } = useUsers();
  const { data: requests = [] } = useRoleRequests();
  const updateRole = useUpdateUserRole();
  const reviewRequest = useReviewRoleRequest();
  const [editingUser, setEditingUser] = useState<string | null>(null);

  if (role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Accès réservé aux administrateurs</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  const handleRoleChange = (userId: string, newRole: string) => {
    updateRole.mutate(
      { userId, role: newRole },
      {
        onSuccess: () => {
          toast({ title: "Rôle mis à jour", description: `Le rôle a été changé en ${roleLabels[newRole]}` });
          setEditingUser(null);
        },
        onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
      }
    );
  };

  const pendingRequests = requests.filter((request: any) => request.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestion des Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">Gérer les comptes, les rôles et les demandes d'élévation.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="p-4 flex flex-col items-center"><span className="text-3xl font-bold text-foreground">{users?.length ?? 0}</span><span className="text-xs text-muted-foreground">Total Utilisateurs</span></CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col items-center"><span className="text-3xl font-bold text-status-critical">{users?.filter((u) => u.role === "admin").length ?? 0}</span><span className="text-xs text-muted-foreground">Admins</span></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Liste des Utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Date d'inscription</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.profile?.full_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.phone || "—"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    {editingUser === u.user_id ? (
                      <Select defaultValue={u.role} onValueChange={(val) => handleRoleChange(u.user_id, val)}>
                        <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="utilisateur">Utilisateur</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className={cn("text-xs", roleBadge[u.role] ?? "")}>{roleLabels[u.role] ?? u.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.profile?.created_at ? new Date(u.profile.created_at).toLocaleDateString("fr-FR") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditingUser(editingUser === u.user_id ? null : u.user_id)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demandes d'élévation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
          ) : pendingRequests.map((request: any) => (
            <div key={request._id} className="rounded-lg border p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{request.userId?.firstName} {request.userId?.lastName}</p>
                <p className="text-sm text-muted-foreground">{request.userId?.email}</p>
                <p className="text-xs text-muted-foreground mt-1">{request.reason || "Aucun motif fourni"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => reviewRequest.mutate({ id: request._id, decision: "approve" }, { onSuccess: () => toast({ title: "Demande approuvée" }) })}>
                  <Check className="h-4 w-4 mr-1" /> Approuver
                </Button>
                <Button size="sm" variant="destructive" onClick={() => reviewRequest.mutate({ id: request._id, decision: "reject" }, { onSuccess: () => toast({ title: "Demande refusée" }) })}>
                  <X className="h-4 w-4 mr-1" /> Refuser
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUsers;
